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
        throw error;
      });
  }
  const app = await appPromise;
  return app(req, res);
};

// Express must receive the untouched stream so it can parse JSON, gzip and files.
module.exports.config = { api: { bodyParser: false } };
