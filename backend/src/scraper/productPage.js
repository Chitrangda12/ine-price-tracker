import { config } from '../config.js';
import { ScrapeError } from './errors.js';
import { parsePrice, parseStock, STOCK_KEYWORDS } from './parse.js';

const CONSENT_CONTAINERS =
  '[role="dialog"], [role="alertdialog"], dialog[open], [aria-modal="true"], [class*="consent" i], [class*="cookie" i]';

const CONSENT_ACCEPT =
  /^(accept|allow|agree|i agree|ok|okay|got it|continue|dismiss|close)\b/i;

const OPTION_CONTROLS =
  'button, [role="radio"], [role="option"], [role="tab"], label';

const REVEAL_BUTTON =
  /check today[’']?s price|reveal price|show price|view price|see price|unlock price|get price|check price/i;

const LOADING_TEXT =
  /updating|loading|retrying|checking|fetching|please wait/i;

const FAILURE_TEXT =
  /couldn[’']?t|could not|failed|unavailable|try again|error/i;

const escapeRegExp = (text) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const exactText = (text) =>
  new RegExp(
    `^\\s*${escapeRegExp(text.trim()).replace(/\s+/g, '\\s+')}\\s*$`,
    'i',
  );

function consentAcceptButton(page) {
  return page
    .locator(CONSENT_CONTAINERS)
    .getByRole('button', { name: CONSENT_ACCEPT })
    .filter({ visible: true })
    .first();
}

export async function dismissConsent(page, log) {
  for (let click = 1; click <= 5; click++) {
    const accept = consentAcceptButton(page);

    if ((await accept.count()) === 0) return;

    log(`dismissing consent dialog (click ${click})`);

    await accept.click({ timeout: 3000 }).catch(() => {});

    await page.waitForTimeout(300);
  }

  if ((await consentAcceptButton(page).count()) > 0) {
    throw new ScrapeError(
      'CONSENT_BLOCKING',
      'Consent dialog did not close after 5 clicks',
    );
  }
}

export async function openProductPage(page, url, log) {
  await page.addLocatorHandler(
    consentAcceptButton(page),
    () => dismissConsent(page, log),
    {
      noWaitAfter: true,
    },
  );

  log(`opening ${url}`);

  let response;

  try {
    response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: config.scrape.navigationTimeoutMs,
    });
  } catch (error) {
    throw new ScrapeError(
      'NAVIGATION_FAILED',
      `Store did not respond: ${String(error.message).split('\n')[0]}`,
    );
  }

  if (response && response.status() >= 500) {
    throw new ScrapeError(
      'STORE_HTTP_ERROR',
      `Store answered HTTP ${response.status()}`,
    );
  }
}

export async function waitForProductHeading(page, expectedName, log) {
  const heading = page
    .getByRole('heading', {
      name: exactText(expectedName),
    })
    .first();

  try {
    await heading.waitFor({
      state: 'visible',
      timeout: config.scrape.renderTimeoutMs,
    });
  } catch {
    const seen = (await page.getByRole('heading').allInnerTexts())
      .map((text) => text.trim())
      .filter(Boolean);

    if (seen.length) {
      throw new ScrapeError(
        'PRODUCT_MISMATCH',
        `Expected "${expectedName}" but the page shows: ${seen
          .slice(0, 3)
          .join(' | ')}`,
      );
    }

    const seconds = config.scrape.renderTimeoutMs / 1000;

    throw new ScrapeError(
      'PAGE_NOT_RENDERED',
      `Product page did not render within ${seconds}s (slow or dropped load)`,
    );
  }

  log(`product page rendered: "${expectedName}"`);

  await dismissConsent(page, log);

  return heading;
}

function optionSelectionState({ label, controls }) {
  const normalize = (text) =>
    String(text).replace(/\s+/g, ' ').trim().toLowerCase();

  const target = [...document.querySelectorAll(controls)].find(
    (element) => normalize(element.textContent) === normalize(label),
  );

  if (!target) return 'missing';

  const isSelected = (element) =>
    ['aria-pressed', 'aria-checked', 'aria-selected'].some(
      (attribute) => element.getAttribute(attribute) === 'true',
    ) ||
    ['on', 'checked', 'active', 'selected'].includes(
      element.dataset.state,
    ) ||
    element.dataset.selected === 'true' ||
    element.dataset.active === 'true' ||
    Boolean(element.querySelector('input:checked')) ||
    (element.getAttribute('class') || '')
      .split(/\s+/)
      .some((className) =>
        /(^|[-_])(active|selected|checked|current|on)$/i.test(className),
      );

  if (isSelected(target)) return 'selected';

  const group = [...(target.parentElement?.children ?? [])];

  return group.some(isSelected) ? 'other-selected' : 'no-indicator';
}

export async function selectOption(page, optionLabel, log) {
  const chip = page
    .locator(OPTION_CONTROLS)
    .filter({
      hasText: exactText(optionLabel),
      visible: true,
    })
    .first();

  try {
    await chip.waitFor({
      state: 'visible',
      timeout: config.scrape.renderTimeoutMs,
    });
  } catch {
    const shown = (
      await page
        .locator('button')
        .filter({ visible: true })
        .allInnerTexts()
    )
      .map((text) => text.trim())
      .filter(Boolean);

    throw new ScrapeError(
      'OPTION_NOT_FOUND',
      `Option "${optionLabel}" is not on the page (buttons shown: ${
        shown.slice(0, 8).join(', ') || 'none'
      })`,
    );
  }

  for (let click = 1; click <= 2; click++) {
    log(`selecting option "${optionLabel}"`);

    await chip.click();

    await page.waitForTimeout(400);

    const state = await page.evaluate(optionSelectionState, {
      label: optionLabel,
      controls: OPTION_CONTROLS,
    });

    if (state === 'selected') {
      return 'selected-state';
    }

    if (state === 'no-indicator') {
      return 'exact-label-click';
    }
  }

  throw new ScrapeError(
    'OPTION_NOT_SELECTED',
    `Clicked "${optionLabel}" but the page shows another option selected`,
  );
}

export async function confirmOptionStillSelected(
  page,
  optionLabel,
  confirmedBy,
) {
  const state = await page.evaluate(optionSelectionState, {
    label: optionLabel,
    controls: OPTION_CONTROLS,
  });

  const ok =
    confirmedBy === 'selected-state'
      ? state === 'selected'
      : state === 'selected' || state === 'no-indicator';

  if (!ok) {
    throw new ScrapeError(
      'OPTION_CHANGED',
      `Option "${optionLabel}" was no longer selected when the price loaded`,
    );
  }
}

export async function findRevealButton(page) {
  const button = page
    .getByRole('button', {
      name: REVEAL_BUTTON,
    })
    .filter({ visible: true })
    .first();

  try {
    await button.waitFor({
      state: 'visible',
      timeout: config.scrape.renderTimeoutMs,
    });
  } catch {
    throw new ScrapeError(
      'PRICE_BUTTON_NOT_FOUND',
      'No "Check today\'s price" / "Reveal price" button on the page',
    );
  }

  return button;
}

export async function markProductArea(page, heading, button) {
  const [headingElement, buttonElement] = [
    await heading.elementHandle(),
    await button.elementHandle(),
  ];

  await page.evaluate(
    ([headingEl, buttonEl]) => {
      document
        .querySelectorAll('[data-tracker-area]')
        .forEach((element) =>
          element.removeAttribute('data-tracker-area'),
        );

      let area = headingEl;

      while (area && !area.contains(buttonEl)) {
        area = area.parentElement;
      }

      (area ?? document.body).setAttribute('data-tracker-area', '');
    },
    [headingElement, buttonElement],
  );
}

async function hoverLikeAPerson(page, button) {
  await button.scrollIntoViewIfNeeded();

  const panelHandle = await button.evaluateHandle((element) => {
    let node = element;

    for (let i = 0; i < 4 && node.parentElement; i++) {
      const rect = node.getBoundingClientRect();

      if (rect.width >= 240 && rect.height >= 80) {
        break;
      }

      node = node.parentElement;
    }

    return node;
  });

  const panel = await panelHandle.boundingBox();

  await panelHandle.dispose();

  const target = await button.boundingBox();

  if (!panel || !target) {
    throw new ScrapeError(
      'PRICE_PANEL_HIDDEN',
      'The price panel is not on screen',
    );
  }

  for (let i = 0; i < 10; i++) {
    const x = panel.x + panel.width * (0.2 + 0.15 * (i % 5));
    const y = panel.y + panel.height * (i % 2 ? 0.35 : 0.65);

    await page.mouse.move(x, y, {
      steps: 3,
    });

    await page.waitForTimeout(40);
  }

  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height / 2,
    {
      steps: 5,
    },
  );

  await page.waitForTimeout(900);
}

async function waitUntilEnabled(button, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await button.isEnabled().catch(() => false)) {
      return true;
    }

    await button.page().waitForTimeout(250);
  }

  return false;
}

export async function clickToReveal(page, button, before, log) {
  for (let round = 1; round <= 3; round++) {
    await dismissConsent(page, log);

    log(`hovering over the price panel (round ${round})`);

    await hoverLikeAPerson(page, button);

    if (!(await waitUntilEnabled(button, 2500))) {
      log('price button is still disabled after hovering; hovering again');
      continue;
    }

    log('clicking the price button');

    await button.click();

    const deadline = Date.now() + 5000;

    while (Date.now() < deadline) {
      const current = await inspectArea(page);

      if (current.lines.some((line) => !before.lines.has(line))) {
        return;
      }

      await page.waitForTimeout(250);
    }

    log('the click had no visible effect; trying again');
  }

  throw new ScrapeError(
    'REVEAL_NO_RESPONSE',
    'Price did not start loading after 3 hover-and-click rounds',
  );
}

function readVisibleArea(stockKeywords) {
  const area =
    document.querySelector('[data-tracker-area]') ?? document.body;

  const stockRegex = new RegExp(stockKeywords, 'i');

  const SKIP =
    'h1,h2,h3,h4,h5,h6,[role="radio"],[role="option"],label,select,input,script,style,noscript,svg';

  const memo = new Map();

  function isHidden(element) {
    if (!element || element === document.documentElement) {
      return false;
    }

    if (memo.has(element)) {
      return memo.get(element);
    }

    const styles = getComputedStyle(element);
    const box = element.getBoundingClientRect();

    const hidden =
      element.getAttribute('aria-hidden') === 'true' ||
      element.hidden ||
      styles.display === 'none' ||
      styles.visibility !== 'visible' ||
      Number(styles.opacity) < 0.5 ||
      /rgba\(.*,\s*0\)$/.test(styles.color) ||
      styles.textDecorationLine.includes('line-through') ||
      ['DEL', 'S', 'STRIKE'].includes(element.tagName) ||
      (styles.clip && styles.clip !== 'auto') ||
      /inset\(50%|circle\(0/.test(styles.clipPath) ||
      (styles.overflow !== 'visible' &&
        (box.width <= 2 || box.height <= 2)) ||
      isHidden(element.parentElement);

    memo.set(element, hidden);

    return hidden;
  }

  function visibleText(element) {
    let text = '';

    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
    );

    for (
      let node = walker.nextNode();
      node;
      node = walker.nextNode()
    ) {
      if (!node.nodeValue.trim()) {
        text += node.nodeValue;
        continue;
      }

      if (
        isHidden(node.parentElement) ||
        node.parentElement.closest(SKIP)
      ) {
        continue;
      }

      const range = document.createRange();
      range.selectNodeContents(node);

      const rect = range.getBoundingClientRect();

      if (rect.width < 1 || rect.height < 1 || rect.right <= 0) {
        continue;
      }

      text += node.nodeValue;
    }

    return text.replace(/\s+/g, ' ').trim();
  }

  const priceCandidates = [];
  const candidateIndex = new Map();
  const stockElements = [];

  for (const element of area.querySelectorAll('*')) {
    if (element.closest(SKIP) || isHidden(element)) {
      continue;
    }

    const text = visibleText(element);

    if (!text) continue;

    if (text.length <= 40 && /[0-9\uFF10-\uFF19]/.test(text)) {
      const ancestors = [];

      for (
        let parent = element.parentElement;
        parent && parent !== area;
        parent = parent.parentElement
      ) {
        if (candidateIndex.has(parent)) {
          ancestors.push(candidateIndex.get(parent));
        }
      }

      candidateIndex.set(element, priceCandidates.length);

      priceCandidates.push({
        text,
        fontSize: parseFloat(getComputedStyle(element).fontSize) || 0,
        ancestors,
      });
    }

    if (text.length <= 80 && stockRegex.test(text)) {
      stockElements.push({
        element,
        text,
      });
    }
  }

  const stockControlTexts = [];

  for (const element of area.querySelectorAll(
    'button, [role="button"]',
  )) {
    if (isHidden(element)) {
      continue;
    }

    const box = element.getBoundingClientRect();

    if (box.width < 1 || box.height < 1 || box.right <= 0) {
      continue;
    }

    const text = (
      element.innerText ||
      element.textContent ||
      ''
    )
      .replace(/\s+/g, ' ')
      .trim();

    if (text.length <= 80 && stockRegex.test(text)) {
      stockControlTexts.push(text);
    }
  }

  const stockTexts = [
    ...stockElements
      .filter(
        (stock) =>
          !stockElements.some(
            (other) =>
              other !== stock &&
              stock.element.contains(other.element),
          ),
      )
      .map((stock) => stock.text),
    ...stockControlTexts,
  ].filter(
    (text, index, all) =>
      all.indexOf(text) === index,
  );

  const lines = (area.innerText || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    lines,
    priceCandidates,
    stockTexts,
  };
}

export async function inspectArea(page) {
  return page.evaluate(readVisibleArea, STOCK_KEYWORDS);
}

export async function snapshotBeforeReveal(page) {
  const snapshot = await inspectArea(page);

  return {
    lines: new Set(snapshot.lines),
    priceTexts: new Set(
      snapshot.priceCandidates.map((candidate) => candidate.text),
    ),
  };
}

function interpret(snapshot, before) {
  const newLines = snapshot.lines.filter(
    (line) => !before.lines.has(line),
  );

  const loading = newLines.some((line) => LOADING_TEXT.test(line));

  const all = snapshot.priceCandidates.map((candidate) => ({
    ...candidate,
    parsed: before.priceTexts.has(candidate.text)
      ? { ok: false }
      : parsePrice(candidate.text),
  }));

  const digitCount = (text) =>
    (text.match(/[0-9\uFF10-\uFF19]/g) ?? []).length;

  const prices = all.filter(
    (candidate) =>
      candidate.parsed.ok &&
      !candidate.ancestors.some(
        (index) =>
          all[index].fontSize === candidate.fontSize &&
          digitCount(all[index].text) > digitCount(candidate.text),
      ),
  );

  let price = null;

  let problem = prices.length ? null : 'no price shown yet';

  if (prices.length) {
    const largest = Math.max(
      ...prices.map((candidate) => candidate.fontSize),
    );

    const values = [
      ...new Set(
        prices
          .filter((candidate) => candidate.fontSize === largest)
          .map((candidate) => candidate.parsed.value),
      ),
    ];

    if (values.length === 1) {
      price = values[0];
    } else {
      problem = `two different prices shown at the same size: ${values.join(
        ' vs ',
      )}`;
    }
  }

  const stockValues = [
    ...new Set(
      snapshot.stockTexts
        .map(parseStock)
        .filter((stock) => stock.ok)
        .map((stock) => stock.value),
    ),
  ];

  let stock = null;

  if (stockValues.length === 1) {
    stock = stockValues[0];
  } else if (stockValues.length > 1) {
    problem ??= `conflicting stock values: ${stockValues.join(' vs ')}`;
  } else {
    problem ??= 'no stock information shown';
  }

  const storeError =
    loading || price !== null
      ? null
      : newLines.find((line) => FAILURE_TEXT.test(line)) ?? null;

  return {
    loading,
    price,
    stock,
    storeError,
    problem,
    sawPrice: prices.length > 0,
  };
}

export async function waitForStableQuote(page, before, log) {
  const deadline = Date.now() + config.scrape.quoteTimeoutMs;

  let previous = null;
  let unsettledReads = 0;
  let lastProblem = null;
  let announcedLoading = false;

  while (Date.now() < deadline) {
    await dismissConsent(page, log);

    const quote = interpret(await inspectArea(page), before);

    if (quote.loading) {
      if (!announcedLoading) {
        log('store is loading the price…');
      }

      announcedLoading = true;
      previous = null;
    } else if (quote.price !== null && quote.stock !== null) {
      if (
        previous &&
        previous.price === quote.price &&
        previous.stock === quote.stock
      ) {
        log(
          `read price ${quote.price} and stock ${quote.stock} (stable across two reads)`,
        );

        return {
          price: quote.price,
          stock: quote.stock,
        };
      }

      previous = quote;
    } else if (quote.storeError) {
      throw new ScrapeError(
        'STORE_PRICE_ERROR',
        `Store could not load the price: "${quote.storeError}"`,
      );
    } else if (quote.sawPrice) {
      lastProblem = quote.problem;

      if (++unsettledReads >= 10) {
        throw new ScrapeError(
          'QUOTE_UNREADABLE',
          quote.problem,
        );
      }
    } else {
      lastProblem = quote.problem;
    }

    await page.waitForTimeout(700);
  }

  const seconds = config.scrape.quoteTimeoutMs / 1000;

  throw new ScrapeError(
    'QUOTE_TIMEOUT',
    `Price/stock not readable within ${seconds}s (${
      lastProblem ?? 'still loading'
    })`,
  );
}