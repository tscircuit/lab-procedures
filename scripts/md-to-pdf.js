import fs from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { marked } from "marked"
import puppeteer from "puppeteer-core"

const [, , inputPath, outputPathArg] = process.argv
const outputDirectory = path.resolve("pdfs")

const filesToConvert = inputPath
  ? [
      {
        inputPath: path.resolve(inputPath),
        outputPath: path.resolve(
          outputPathArg ??
            path.join(
              outputDirectory,
              `${path.basename(inputPath, path.extname(inputPath))}.pdf`,
            ),
        ),
      },
    ]
  : await getMarkdownFilesToConvert()

if (filesToConvert.length === 0) {
  console.log("No Markdown files found to convert.")
  process.exit(0)
}

await fs.mkdir(outputDirectory, { recursive: true })

const browser = await puppeteer.launch({
  headless: true,
  executablePath: await findChromeExecutable(),
})

try {
  for (const file of filesToConvert) {
    await convertMarkdownToPdf(browser, file.inputPath, file.outputPath)
  }
} finally {
  await browser.close()
}

async function getMarkdownFilesToConvert() {
  const entries = await fs.readdir(process.cwd(), { withFileTypes: true })

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter(
      (fileName) =>
        path.extname(fileName).toLowerCase() === ".md" &&
        fileName.toLowerCase() !== "readme.md",
    )
    .sort()
    .map((fileName) => ({
      inputPath: path.resolve(fileName),
      outputPath: path.join(
        outputDirectory,
        `${path.basename(fileName, path.extname(fileName))}.pdf`,
      ),
    }))
}

async function convertMarkdownToPdf(browser, inputFilePath, outputFilePath) {
  await fs.mkdir(path.dirname(outputFilePath), { recursive: true })

  const markdown = await fs.readFile(inputFilePath, "utf8")
  const content = marked.parse(markdown)
  const title = path.basename(inputFilePath, path.extname(inputFilePath))
  const html = createHtmlDocument(title, content)

  const page = await browser.newPage()

  try {
    await page.setContent(html, { waitUntil: "networkidle0" })
    await page.pdf({
      path: outputFilePath,
      format: "Letter",
      printBackground: true,
    })
    console.log(`Created ${outputFilePath}`)
  } finally {
    await page.close()
  }
}

function createHtmlDocument(title, content) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(title)}</title>
    <style>
      @page {
        margin: 0.75in;
      }

      body {
        color: #1f2933;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 11pt;
        line-height: 1.55;
      }

      h1,
      h2,
      h3 {
        color: #102a43;
        line-height: 1.25;
        margin: 1.2em 0 0.45em;
      }

      h1 {
        border-bottom: 1px solid #d9e2ec;
        font-size: 24pt;
        padding-bottom: 0.2in;
      }

      h2 {
        font-size: 16pt;
      }

      h3 {
        font-size: 13pt;
      }

      p,
      ul,
      ol,
      table,
      blockquote,
      pre {
        margin: 0 0 0.65em;
      }

      table {
        border-collapse: collapse;
        width: 100%;
      }

      th,
      td {
        border: 1px solid #bcccdc;
        padding: 0.35em 0.5em;
        text-align: left;
        vertical-align: top;
      }

      th {
        background: #f0f4f8;
      }

      code {
        background: #f0f4f8;
        border-radius: 3px;
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
        font-size: 0.92em;
        padding: 0.08em 0.25em;
      }

      pre {
        background: #f0f4f8;
        border-radius: 6px;
        overflow-wrap: break-word;
        padding: 0.75em;
        white-space: pre-wrap;
      }

      pre code {
        background: transparent;
        padding: 0;
      }

      blockquote {
        border-left: 4px solid #9fb3c8;
        color: #52606d;
        padding-left: 0.75em;
      }

      .signature-section {
        break-inside: avoid;
        border-top: 1px solid #bcccdc;
        margin-top: 0.75in;
        padding-top: 0.35in;
      }

      .signature-section h2 {
        font-size: 14pt;
        margin-top: 0;
      }

      .signature-grid {
        display: grid;
        gap: 0.35in;
        grid-template-columns: 1fr 1fr;
        margin-top: 0.35in;
      }

      .signature-line {
        border-top: 1px solid #52606d;
        padding-top: 0.08in;
      }

      .signature-label {
        color: #52606d;
        font-size: 9pt;
      }
    </style>
  </head>
  <body>
    ${content}
    <section class="signature-section">
      <h2>Signature</h2>
      <div class="signature-grid">
        <div class="signature-line">
          <div class="signature-label">Printed Name</div>
        </div>
        <div class="signature-line">
          <div class="signature-label">Signature</div>
        </div>
        <div class="signature-line">
          <div class="signature-label">Date</div>
        </div>
        <div class="signature-line">
          <div class="signature-label">Supervisor / Reviewer</div>
        </div>
      </div>
    </section>
  </body>
</html>`
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

async function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean)

  for (const candidate of candidates) {
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      // Keep looking.
    }
  }

  throw new Error(
    "Could not find Chrome. Install Google Chrome or set CHROME_PATH=/path/to/chrome.",
  )
}
