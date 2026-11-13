const { createApp } = require('./app');
const { app, repo } = createApp();
repo.seedDemoData(); // demo users w1, w2, s1 and equipment e1, e2
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`LOTO API running on http://localhost:${PORT}`));
