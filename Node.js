const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const { Configuration, OpenAIApi } = require('openai');
const { nanoid } = require('nanoid');

const app = express();
app.use(express.json());
app.use(cors());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Connect to MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/memorylane', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB connected'))
  .catch(err => console.log(err));

// OpenAI Setup
const configuration = new Configuration({ apiKey: 'YOUR_OPENAI_API_KEY' });
const openai = new OpenAIApi(configuration);

// Event Schema
const eventSchema = new mongoose.Schema({
  title: String,
  description: String,
  date: Date,
  media: [{ type: { type: String, enum: ['photo','video'] }, url: String }],
  privacy: { type: String, enum: ['private','friends','public'], default: 'private' },
  suggested: { type: Boolean, default: false },
  timelineId: { type: String } // For sharing
});
const Event = mongoose.model('Event', eventSchema);

// File upload setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Add Event
app.post('/events', upload.array('media'), async (req, res) => {
  const files = req.files.map(file => ({
    type: file.mimetype.startsWith('video') ? 'video' : 'photo',
    url: '/uploads/' + file.filename
  }));

  const { title, description, date, privacy, timelineId } = req.body;
  const timelineKey = timelineId || nanoid(8); // generate new timeline ID if none
  const event = new Event({ title, description, date, privacy, media: files, timelineId: timelineKey });
  await event.save();

  // AI automatic milestone suggestion
  const events = await Event.find({ timelineId: timelineKey });
  if (events.length >= 3) { // After 3 events, suggest a milestone
    const prompt = events.map(ev => ev.title).join(', ');
    const completion = await openai.createCompletion({
      model: 'text-davinci-003',
      prompt: `Suggest a memorable milestone based on these events: ${prompt}`,
      max_tokens: 50
    });
    const suggestion = completion.data.choices[0].text.trim();
    const aiEvent = new Event({
      title: suggestion,
      description: 'AI Suggested Event',
      date: new Date(),
      privacy: 'private',
      suggested: true,
      timelineId: timelineKey
    });
    await aiEvent.save();
  }

  res.json({ message: 'Event added', timelineId: timelineKey });
});

// Get Events by timeline
app.get('/events/:timelineId', async (req, res) => {
  const events = await Event.find({ timelineId: req.params.timelineId });
  res.json(events);
});

// Delete Event
app.delete('/events/:id', async (req, res) => {
  await Event.findByIdAndDelete(req.params.id);
  res.json({ message: 'Event deleted' });
});

// Edit Event
app.put('/events/:id', async (req, res) => {
  const { title, description, date, privacy } = req.body;
  const event = await Event.findByIdAndUpdate(req.params.id, { title, description, date, privacy }, { new: true });
  res.json(event);
});

app.listen(5000, () => console.log('Server running on port 5000'));
