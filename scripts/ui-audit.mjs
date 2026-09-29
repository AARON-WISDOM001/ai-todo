/**
 * Headless UI audit.
 *
 * Boots Chrome, loads the app, and reports what a screenshot cannot be
 * checked for programmatically: console errors, horizontal overflow, elements
 * that overlap, contrast failures, missing accessible names, and whether the
 * intended layout regions are present at each breakpoint.
 *
 * Usage: node scripts/ui-audit.mjs [baseUrl]
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE_URL = process.argv[2] ?? 'http://localhost:5177/'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9222

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 834, height: 1112 },
  { name: 'desktop', width: 1440, height: 900 },
]

/** Overlay states, audited at desktop size where the most chrome is visible. */
const OVERLAYS = [
  {
    name: 'command-bar',
    width: 1440,
    height: 900,
    setup: `[...document.querySelectorAll('button')].find(b => /Ask AI/.test(b.textContent))?.click()`,
    expect: '[role="dialog"]',
  },
  {
    name: 'command-bar-filled',
    width: 1440,
    height: 900,
    setup: `
      [...document.querySelectorAll('button')].find(b => /Ask AI/.test(b.textContent))?.click();
      const wait = async (sel) => {
        for (let i = 0; i < 60 && !document.querySelector(sel); i++) {
          await new Promise(r => setTimeout(r, 50));
        }
        return document.querySelector(sel);
      };
      const ta = await wait('#ai-command-input');
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, 'Submit my internship report next Friday and make it high priority');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    `,
    expect: '#ai-command-input',
    // The filled command bar should surface an interpret-preview affordance.
    expectTasks: 5,
  },
  {
    name: 'task-editor',
    width: 1440,
    height: 900,
    setup: `document.querySelector('[data-task-row] [data-role="title"]')?.click()`,
    expect: '[role="dialog"]',
  },
  {
    name: 'task-editor-mobile',
    width: 390,
    height: 844,
    setup: `document.querySelector('[data-task-row] [data-role="title"]')?.click()`,
    expect: '[role="dialog"]',
  },
  {
    name: 'mobile-drawer',
    width: 390,
    height: 844,
    setup: `[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Open navigation')?.click()`,
    expect: '[role="dialog"][aria-label="Navigation"]',
  },
  {
    name: 'completed-view',
    width: 1440,
    height: 900,
    setup: `[...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith('Completed'))?.click()`,
    expect: '[data-task-row]',
  },
  {
    name: 'search-no-match',
    width: 1440,
    height: 900,
    setup: `
      const wait = async (sel) => {
        for (let i = 0; i < 60 && !document.querySelector(sel); i++) {
          await new Promise(r => setTimeout(r, 50));
        }
        return document.querySelector(sel);
      };
      const input = await wait('input[type="search"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'zzz nothing matches this');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    `,
    expect: 'input[type="search"]',
    // Zero rows is the point of this scenario: it is the no-results state.
    expectTasks: 0,
  },
  // Dark theme is seeded rather than clicked. Headless Chrome reports its own
  // `prefers-color-scheme`, so a scenario that starts from `system` begins in
  // whichever appearance the browser picked — clicking then lands somewhere
  // different on each machine. Seeding before the reload also exercises the
  // no-flash script, since the theme has to be right at first paint.
  {
    name: 'dark-desktop',
    width: 1440,
    height: 900,
    seed: { theme: 'dark' },
    expect: 'html[data-theme="dark"]',
  },
  {
    name: 'theme-toggle',
    width: 1440,
    height: 900,
    seed: { theme: 'light' },
    setup: `[...document.querySelectorAll('button')].find(b => /Dark mode/.test(b.textContent))?.click()`,
    expect: 'html[data-theme="dark"]',
  },
  {
    name: 'dark-task-editor',
    width: 1440,
    height: 900,
    seed: { theme: 'dark' },
    setup: `document.querySelector('[data-task-row] [data-role="title"]')?.click()`,
    expect: '[role="dialog"]',
  },
  {
    name: 'dark-command-bar',
    width: 1440,
    height: 900,
    seed: { theme: 'dark' },
    setup: `[...document.querySelectorAll('button')].find(b => /Ask AI/.test(b.textContent))?.click()`,
    expect: '[role="dialog"]',
  },
  {
    name: 'dark-mobile-drawer',
    width: 390,
    height: 844,
    seed: { theme: 'dark' },
    setup: `[...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Open navigation')?.click()`,
    expect: '[role="dialog"][aria-label="Navigation"]',
  },
  {
    name: 'dark-search-no-match',
    width: 1440,
    height: 900,
    seed: { theme: 'dark' },
    setup: `
      const wait = async (sel) => {
        for (let i = 0; i < 60 && !document.querySelector(sel); i++) {
          await new Promise(r => setTimeout(r, 50));
        }
        return document.querySelector(sel);
      };
      const input = await wait('input[type="search"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'zzz nothing matches this');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    `,
    expect: 'input[type="search"]',
    // The empty state carries its own text, so it has to be legible too.
    expectTasks: 0,
  },
]

const profile = mkdtempSync(join(tmpdir(), 'ui-audit-'))
const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--no-first-run',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + profile,
  'about:blank',
])

const cleanup = () => {
  chrome.kill()
  try {
    rmSync(profile, { recursive: true, force: true })
  } catch {}
}
process.on('exit', cleanup)

await waitForDevtools()

const browserWs = await fetchJson(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.webSocketDebuggerUrl)
const browser = await connect(browserWs)

const problems = []

// One target for the whole run. Creating and destroying a target per scenario
// churns renderer processes, and CDP occasionally reports "target navigated or
// closed" against a session that was attached a moment too early.
const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' })
const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true })
const sessionSend = (method, params) => browser.send(method, params, sessionId)

for (const viewport of VIEWPORTS) {
  const report = await audit(viewport, sessionSend)
  for (const line of report.lines) console.log(line)
  problems.push(...report.problems.map((p) => `[${viewport.name}] ${p}`))
}

for (const overlay of OVERLAYS) {
  const report = await audit({ ...overlay, isOverlay: true }, sessionSend)
  for (const line of report.lines) console.log(line)
  problems.push(...report.problems.map((p) => `[${overlay.name}] ${p}`))
}

console.log('\n' + '='.repeat(70))
if (problems.length === 0) {
  console.log('PASS — no console errors, overflow, overlaps, or a11y violations found.')
} else {
  console.log(`${problems.length} PROBLEM(S):`)
  for (const problem of problems) console.log('  • ' + problem)
}
console.log('='.repeat(70))

await browser.send('Browser.close').catch(() => {})
cleanup()
process.exit(problems.length === 0 ? 0 : 1)

/* -------------------------------------------------------------------------- */

async function audit(viewport, sessionSend) {
  const lines = []
  const send = sessionSend
  const consoleErrors = []

  browser.on('Runtime.consoleAPICalled', (p) => {
    if (p.sessionId !== sessionId) return
    if (p.type === 'error' || p.type === 'warning') {
      consoleErrors.push(`console.${p.type}: ${p.args.map((a) => a.value ?? a.description).join(' ')}`)
    }
  })
  browser.on('Runtime.exceptionThrown', (p) => {
    if (p.sessionId !== sessionId) return
    consoleErrors.push('uncaught: ' + (p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text))
  })

  await send('Runtime.enable')
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.width < 768,
  })

  /**
   * `Page.navigate` tears down the execution context, so an evaluate issued
   * straight afterwards can land on a context that is already gone. CDP answers
   * that with "target navigated or closed", which is a race rather than a real
   * failure, so retry it a few times before giving up.
   */
  const evaluate = async (expression, options = {}) => {
    let lastError
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        return await send('Runtime.evaluate', { expression, returnByValue: true, ...options })
      } catch (error) {
        if (!/navigated or closed|Cannot find context|Execution context was destroyed/i.test(error.message)) {
          throw error
        }
        lastError = error
        await sleep(150)
      }
    }
    throw lastError
  }

  /** Waits until React has mounted into #root. */
  const waitForMount = () =>
    waitFor(async () => {
      const { result } = await evaluate('!!document.querySelector("#root > *")')
      return result.value === true
    })

  await send('Page.navigate', { url: BASE_URL })
  await waitForMount()

  // Seed a realistic task list so layout is exercised with real content, not
  // just empty states. Must happen on the app's own origin.
  const seeded = await evaluate(`(() => {
      const now = new Date();
      const key = d => {
        const x = new Date(now);
        x.setDate(x.getDate() + d);
        return x.toISOString().slice(0, 10);
      };
      const mk = (id, title, description, priority, dueDate, completed, source, subtasks) => ({
        id, title, description, priority, dueDate, completed, source, subtasks,
        createdAt: now.toISOString(), updatedAt: now.toISOString(),
      });
      const tasks = [
        mk('t1', 'Submit the AI engineering internship report', 'Needs the results section finished and a supervisor review before submission.', 'high', key(0), false, 'manual', []),
        mk('t2', 'Review pull requests on the deploy service', '', 'medium', key(1), false, 'ai', []),
        mk('t3', 'Prepare the demo walkthrough for Friday', 'Screen recording, slide deck, and a fallback path in case the live demo fails.', 'high', key(3), false, 'ai', [
          { id: 't3:s0', title: 'Record the end-to-end walkthrough', completed: true },
          { id: 't3:s1', title: 'Write the fallback slides', completed: false },
          { id: 't3:s2', title: 'Test the demo on the staging environment', completed: false },
        ]),
        mk('t4', 'Book the project review meeting', '', 'low', key(-2), false, 'ai', []),
        mk('t5', 'Draft the architecture diagram', '', 'medium', null, false, 'manual', []),
        mk('t6', 'Set up the staging database', '', 'low', key(9), true, 'manual', []),
      ];
      localStorage.setItem('ai-todo:tasks:v1', JSON.stringify(tasks));
      ${viewport.seed?.theme ? `localStorage.setItem('ai-todo:theme:v1', ${JSON.stringify(viewport.seed.theme)});` : ''}
      return localStorage.getItem('ai-todo:tasks:v1').length;
    })()`)
  if (!seeded.result?.value) {
    consoleErrors.push('failed to seed localStorage on the app origin')
  }

  // Reload so the app hydrates from the seeded storage.
  await send('Page.reload')
  await waitForMount()
  await waitFor(async () => {
    const { result } = await evaluate('document.querySelectorAll("[data-task-row]").length > 0')
    return result.value === true
  })
  await sleep(250)

  if (viewport.setup) {
    const opened = await evaluate(`(async () => { ${viewport.setup} })()`, { awaitPromise: true })
    if (opened.exceptionDetails) {
      consoleErrors.push('setup failed: ' + opened.exceptionDetails.text)
    }
    // Wait for the state the setup was supposed to produce, so the audit never
    // inspects a frame from before React committed.
    if (viewport.expect) {
      await waitFor(async () => {
        const { result } = await evaluate(`!!document.querySelector(${JSON.stringify(viewport.expect)})`)
        return result.value === true
      }).catch(() => {
        consoleErrors.push(`expected ${viewport.expect} to appear, but it never did`)
      })
    }
    await sleep(400)
  }

  const { result } = await evaluate(`(${inspect.toString()})()`, { awaitPromise: true })

  const found = result.value
  lines.push('')
  lines.push(`── ${viewport.name} (${viewport.width}×${viewport.height}) ─────────────────────────`)
  lines.push(`   tasks rendered : ${found.taskCount}`)
  lines.push(`   dialogs open   : ${found.dialogCount}`)
  lines.push(`   doc scrollW    : ${found.documentScrollWidth} (viewport ${viewport.width})`)
  lines.push(`   interactive    : ${found.interactiveCount} controls, ${found.unlabelled} unlabelled`)
  lines.push(`   overlaps       : ${found.overlaps.length}`)
  lines.push(`   low contrast   : ${found.lowContrast.length}`)

  for (const overlap of found.overlaps) lines.push('   ! overlap: ' + overlap)
  for (const contrast of found.lowContrast) lines.push('   ! contrast: ' + contrast)
  for (const missing of found.missingRegions) lines.push('   ! missing region: ' + missing)
  for (const error of consoleErrors) lines.push('   ! ' + error)

  await sleep(50)

  return {
    lines,
    problems: [
      ...consoleErrors,
      ...found.overlaps,
      ...found.lowContrast,
      ...found.missingRegions,
      ...(found.documentScrollWidth > viewport.width + 1
        ? [`horizontal overflow: ${found.documentScrollWidth}px > ${viewport.width}px`]
        : []),
      ...(found.unlabelled > 0 ? [`${found.unlabelled} interactive controls without an accessible name`] : []),
      ...(found.taskCount === 0 && viewport.expectTasks !== 0 ? ['no tasks rendered'] : []),
    ],
  }
}

/** Runs in the page. Reports layout and accessibility problems. */
function inspect() {
  const problems = { overlaps: [], lowContrast: [], missingRegions: [] }
  const rows = Array.from(document.querySelectorAll('[data-task-row]'))

  const visible = (el) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }

  /* --- horizontal overflow ------------------------------------------------ */
  const documentScrollWidth = document.documentElement.scrollWidth

  /* --- task rows overlap each other or the viewport edges ----------------- */
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i].getBoundingClientRect()
    if (r.right > window.innerWidth + 1) {
      problems.overlaps.push(`row ${i} extends past the viewport (right=${Math.round(r.right)})`)
    }
    if (i > 0) {
      const previous = rows[i - 1].getBoundingClientRect()
      if (r.top < previous.bottom - 0.5) {
        problems.overlaps.push(`row ${i} overlaps row ${i - 1}`)
      }
    }
  }

  /* --- fixed overlays must not cover the composer or list ----------------- */
  const fixed = Array.from(document.querySelectorAll('body *')).filter((el) => {
    const style = getComputedStyle(el)
    return (style.position === 'fixed' || style.position === 'sticky') && visible(el)
  })
  const anchor = document.querySelector('#quick-add, #quick-add input')
  const dialogCount = document.querySelectorAll('[role="dialog"]').length

  if (anchor && fixed.length > 0 && dialogCount === 0) {
    const anchorRect = anchor.getBoundingClientRect()
    for (const el of fixed) {
      if (el.contains(anchor) || anchor.contains(el)) continue
      const rect = el.getBoundingClientRect()
      const overlapsComposer =
        rect.top < anchorRect.bottom && rect.bottom > anchorRect.top && rect.left < anchorRect.right && rect.right > anchorRect.left
      if (overlapsComposer) {
        problems.overlaps.push(`fixed element <${el.tagName.toLowerCase()}> covers the task composer`)
      }
    }
  }

  /* --- a dialog must contain every control that receives focus ----------- */
  for (const dialog of document.querySelectorAll('[role="dialog"]')) {
    const rect = dialog.getBoundingClientRect()
    if (rect.right > window.innerWidth + 1 || rect.left < -1) {
      problems.overlaps.push('dialog panel is clipped by the viewport')
    }
    if (rect.bottom > window.innerHeight + 1) {
      problems.overlaps.push(
        `dialog panel overflows the viewport (bottom=${Math.round(rect.bottom)} > ${window.innerHeight})`,
      )
    }
  }

  /* --- accessible names --------------------------------------------------- */
  const interactive = Array.from(
    document.querySelectorAll('button, a[href], input, select, textarea, [role="checkbox"]'),
  ).filter(visible)
  const unlabelled = interactive.filter((el) => {
    const text = (el.textContent ?? '').trim()
    const label = el.getAttribute('aria-label') ?? ''
    const labelledBy = el.getAttribute('aria-labelledby')
    const id = el.getAttribute('id')
    const forLabel = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null
    const wrapped = el.closest('label')
    const title = el.getAttribute('title') ?? ''
    return !(text || label || labelledBy || forLabel || wrapped || title)
  })
  const unlabelledCount = unlabelled.length
  if (unlabelledCount > 0) {
    problems.overlaps.push(
      `${unlabelledCount} control(s) with no accessible name: ` +
        unlabelled.slice(0, 4).map((el) => el.outerHTML.slice(0, 90)).join(' | '),
    )
  }

  /* --- contrast on text nodes --------------------------------------------
     Tailwind v4 emits colors as oklch(), which a naive regex cannot read.
     Rather than reimplement colour-space conversion, hand the value to a canvas
     and let the browser normalise it to sRGB. */
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const parse = (color) => {
    if (!ctx || !color) return null
    ctx.fillStyle = '#000'
    ctx.fillStyle = color
    const normalized = ctx.fillStyle
    const m = normalized.match(/[\d.]+/g)
    if (!m || m.length < 3) return null
    return [Number(m[0]), Number(m[1]), Number(m[2])]
  }
  const luminance = ([r, g, b]) => {
    const f = (c) => {
      const s = c / 255
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const effectiveBg = (el) => {
    let node = el
    while (node && node !== document.documentElement) {
      const bg = getComputedStyle(node).backgroundColor
      if (bg && !/rgba?\(0, 0, 0, 0\)|transparent/.test(bg)) {
        const rgb = parse(bg)
        if (rgb) return rgb
      }
      node = node.parentElement
    }
    return [255, 255, 255]
  }

  const textNodes = Array.from(document.querySelectorAll('p, span, h1, h2, h3, button, a, label, li'))
    .filter((el) => el.children.length === 0 && (el.textContent ?? '').trim().length > 1 && visible(el))
    .slice(0, 120)

  const seen = new Set()
  for (const el of textNodes) {
    const style = getComputedStyle(el)
    if (style.visibility === 'hidden' || style.opacity === '0') continue
    const fg = parse(style.color)
    if (!fg) continue
    const bg = effectiveBg(el)
    if (!bg) continue
    const l1 = Math.max(luminance(fg), luminance(bg))
    const l2 = Math.min(luminance(fg), luminance(bg))
    const ratio = (l1 + 0.05) / (l2 + 0.05)
    const size = parseFloat(style.fontSize)
    const bold = Number(style.fontWeight) >= 700
    const large = size >= 24 || (size >= 18.66 && bold)
    const required = large ? 3 : 4.5
    if (ratio < required) {
      const key = style.color + '|' + Math.round(size)
      if (seen.has(key)) continue
      seen.add(key)
      problems.lowContrast.push(
        `ratio ${ratio.toFixed(2)} (needs ${required}) — ${style.color} at ${size}px on rgb(${bg}) — "${(el.textContent ?? '').trim().slice(0, 30)}"`,
      )
    }  }

  /* --- required regions per breakpoint ------------------------------------ */
  const hasSidebarNav = !!document.querySelector('nav[aria-label="Task views"]')
  const hasTabBar = Array.from(document.querySelectorAll('nav[aria-label="Task views"]')).some(
    (el) => getComputedStyle(el).position === 'static' && el.querySelectorAll('button').length === 5,
  )
  const hasComposer = !!document.querySelector('#quick-add')
  const hasSearch = !!document.querySelector('input[type="search"]')
  const hasSkipLink = !!document.querySelector('a[href="#task-list"]')

  if (!hasComposer) problems.missingRegions.push('task composer missing')
  if (!hasSearch) problems.missingRegions.push('search input missing')
  if (!hasSkipLink) problems.missingRegions.push('skip link missing')
  if (!hasSidebarNav) problems.missingRegions.push('primary navigation missing')
  if (window.innerWidth >= 1024 && !hasSidebarNav) problems.missingRegions.push('desktop sidebar missing')
  if (window.innerWidth < 768 && !hasTabBar) problems.missingRegions.push('mobile tab bar missing')

  return {
    taskCount: rows.length,
    dialogCount,
    documentScrollWidth,
    interactiveCount: interactive.length,
    unlabelled: unlabelledCount,
    overlaps: problems.overlaps,
    lowContrast: problems.lowContrast,
    missingRegions: problems.missingRegions,
  }
}

/* --- minimal CDP client --------------------------------------------------- */

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    const pending = new Map()
    const listeners = []
    let id = 0

    socket.addEventListener('open', () =>
      resolve({
        send(method, params, sessionId) {
          return new Promise((res, rej) => {
            const messageId = ++id
            pending.set(messageId, { res, rej })
            socket.send(JSON.stringify({ id: messageId, method, params, sessionId }))
          })
        },
        on(event, handler) {
          listeners.push({ event, handler })
        },
      }),
    )
    socket.addEventListener('error', reject)
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id && pending.has(message.id)) {
        const { res, rej } = pending.get(message.id)
        pending.delete(message.id)
        if (message.error) rej(new Error(message.error.message))
        else res(message.result)
      } else if (message.method) {
        for (const { event: name, handler } of listeners) {
          if (name === message.method) handler({ ...message, sessionId: message.sessionId })
        }
      }
    })
  })
}

async function fetchJson(url) {
  const response = await fetch(url)
  return response.json()
}

async function waitForDevtools() {
  // A cold Chrome start on macOS takes longer than a warm one — well past 12s
  // when no browser is already running. A short budget made this harness fail
  // intermittently, which is worse than no audit: a flaky gate gets ignored, and
  // a genuine regression hides behind the noise.
  for (let i = 0; i < 120; i++) {
    if (chrome.exitCode !== null) {
      throw new Error(`Chrome exited with code ${chrome.exitCode} before DevTools came up`)
    }
    try {
      await fetchJson(`http://127.0.0.1:${PORT}/json/version`)
      return
    } catch {
      await sleep(500)
    }
  }
  throw new Error('Chrome DevTools endpoint never became available')
}

async function waitFor(predicate, timeout = 10000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await predicate()) return
    await sleep(120)
  }
  throw new Error('Timed out waiting for the page')
}
