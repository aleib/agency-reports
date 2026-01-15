import Fastify from "fastify";
import puppeteer from "puppeteer";

const server = Fastify({
  logger: true,
});

// Render HTML to PDF
server.post<{ Body: { html: string } }>("/render", async (request, reply) => {
  const { html } = request.body;

  if (!html) {
    return reply.status(400).send({ error: "HTML content is required" });
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      margin: {
        top: "20mm",
        right: "20mm",
        bottom: "20mm",
        left: "20mm",
      },
      printBackground: true,
    });

    reply.header("Content-Type", "application/pdf");
    return reply.send(pdfBuffer);
  } finally {
    await browser.close();
  }
});

// Health check
server.get("/health", async () => {
  return { status: "healthy" };
});

const start = async () => {
  try {
    const port = parseInt(process.env.RENDERER_PORT || "3001", 10);
    await server.listen({ port, host: "0.0.0.0" });
    console.log(`Renderer service listening on port ${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
