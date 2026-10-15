const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/data.js", ["data.js", "text/javascript; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
]);

const server = http.createServer((request, response) => {
  const entry = files.get(request.url);
  if (!entry || !["GET", "HEAD"].includes(request.method)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  fs.readFile(path.join(__dirname, entry[0]), (error, content) => {
    if (error) {
      console.error("Unable to serve application file:", error);
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Unable to load application.");
      return;
    }
    response.writeHead(200, {
      "Content-Type": entry[1],
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    });
    response.end(request.method === "HEAD" ? undefined : content);
  });
});

server.on("error", (error) => {
  console.error("Local server failed:", error.message);
  process.exitCode = 1;
});
server.listen(3000, "127.0.0.1", () => {
  console.log("Wazi demo is available at http://127.0.0.1:3000");
});
