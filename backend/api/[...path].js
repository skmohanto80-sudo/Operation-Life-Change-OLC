// Vercel Node.js Function adapter for the existing Express API.
// Keep one database pool and Express app per warm function instance.
const { main } = require('../server');

let appPromise;

module.exports = async function handler(req, res) {
  if (!appPromise) {
    appPromise = main({ listen: false })
      .then(({ app }) => app)
      .catch((error) => {
        appPromise = null;
        console.error('OLC backend initialization failed:', error && (error.stack || error.message || error));
        throw error;
      });
  }
   try {
    const app = await appPromise;
    return app(req, res);
  } catch (error) {
    if (!res.headersSent) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: false, error: 'Backend database initialization failed. Check the Vercel function logs.' }));
    }
  }
}

// Express must receive the untouched stream so it can parse JSON, gzip and files.
module.exports.config = { api: { bodyParser: false } };
