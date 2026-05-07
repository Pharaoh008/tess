const { fetchProduct } = require("../lib/amazon");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ ok: false, error: "Method not allowed." });
    return;
  }

  try {
    const product = await fetchProduct(req.query.country, req.query.asin);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ ok: true, product });
  } catch (error) {
    res.setHeader("Cache-Control", "no-store");
    res.status(400).json({ ok: false, error: error.message });
  }
};
