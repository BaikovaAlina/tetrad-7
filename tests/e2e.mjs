import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lessons } from '../site/assets/js/curriculum.js';
import { getWork, getTask } from '../site/assets/js/bank.js';
const site = path.resolve(fileURLToPath(new URL('../site/', import.meta.url)));
const artifact = fileURLToPath(new URL('../test-results/', import.meta.url));
await mkdir(artifact, { recursive: true });
const mime = {
  '.html': 'text/html;charset=utf-8',
  '.js': 'application/javascript;charset=utf-8',
  '.css': 'text/css;charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};
// Подкаталог намеренно повторяет адрес project Pages: /repo/.
const server = createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://example.test').pathname);
    if (!pathname.startsWith('/school/')) {
      res.writeHead(404);
      res.end();
      return;
    }
    pathname = pathname.slice('/school/'.length) || 'index.html';
    const file = path.resolve(site, pathname);
    if (!file.startsWith(site + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const data = await readFile(file);
    res.writeHead(200, {
      'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/school/`;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const errors = [],
  results = [];
let activePage;
const observe = (page) => {
  activePage = page;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
};
const scenario = async (title, fn) => {
  await fn();
  results.push(title);
  console.log('✓', title);
};
const goto = async (page, route = 'catalog') => {
  await page.goto(base + '#/' + route, { waitUntil: 'networkidle' });
};
const submit = async (page, q, input) => {
  if (q.type === 'choice') await page.locator(`input[name="choice"][value="${input}"]`).check();
  else await page.locator('#answer-input').fill(input);
  await page.locator('#answer-form button[type=submit]').click();
};
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('tetrad7:state:v1')));
const noOverflow = async (page) =>
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    true
  );
try {
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: 'reduce',
    }),
    page = await context.newPage();
  observe(page);
  let externalRequests = 0;
  page.on('request', (r) => {
    if (!r.url().startsWith(base)) externalRequests++;
  });
  await scenario(
    'Каталог в подкаталоге Pages: 18 модулей, фильтры, поиск и память фильтров',
    async () => {
      await goto(page);
      assert.equal(await page.locator('.module-card').count(), 18);
      await noOverflow(page);
      await page.screenshot({ path: path.join(artifact, 'catalog-desktop.png'), fullPage: false });
      await page.locator('[data-subject="geometry"][data-action="filter-subject"]').click();
      assert.equal(await page.locator('.module-card').count(), 7);
      await page.locator('#level-filter').selectOption('advanced');
      assert.equal(await page.locator('.module-card').count(), 2);
      await page.locator('#catalog-search').fill('геометрических мест');
      assert.equal(await page.locator('.lesson-title-link').count(), 1);
      assert.match(await page.locator('.lesson-title-link').innerText(), /Метод геометрических/);
      await page.reload({ waitUntil: 'networkidle' });
      assert.equal(await page.locator('#level-filter').inputValue(), 'advanced');
      assert.equal(await page.locator('#catalog-search').inputValue(), 'геометрических мест');
      await page.locator('#catalog-search').fill('невозможныйпоиск');
      assert.match(await page.locator('#catalog-results').innerText(), /ничего не нашлось/);
      await page.locator('#catalog-results [data-action="reset-filters"]').click();
      assert.equal(await page.locator('.module-card').count(), 18);
    }
  );
  await scenario('Имя через диалог, первая ошибка, неверный формат и исправление', async () => {
    await goto(page, 'train/a11?work=homework&variant=e2e');
    await page.locator('#student-name').fill('Саша <b>&');
    await page.locator('#student-class').fill('7А');
    await page.locator('#profile-form button[type=submit]').click();
    await page.waitForSelector('#answer-form');
    const q = getWork('a11', 'homework', 'e2e')[0];
    assert.equal((await saved(page)).profile.name, 'Саша <b>&');
    assert.equal(await page.locator('.profile-meta strong b').count(), 0);
    await submit(page, q, 'abc!');
    assert.equal(await page.locator('#answer-feedback').getAttribute('data-kind'), 'format');
    assert.equal((await saved(page)).sessions[0].answers[q.id]?.firstCorrect, undefined);
    await submit(page, q, '999999');
    assert.equal(await page.locator('#answer-feedback').getAttribute('data-kind'), 'wrong');
    await submit(page, q, q.answer);
    assert.equal(await page.locator('#answer-feedback').getAttribute('data-kind'), 'correct');
    assert.equal((await saved(page)).sessions[0].answers[q.id].firstCorrect, false);
    assert.equal((await saved(page)).sessions[0].answers[q.id].latestCorrect, true);
  });
  await scenario('Черновик и текущий номер сохраняются после перезагрузки', async () => {
    await page.locator('[data-action="next-question"]').click();
    await page.locator('#answer-input').fill('7/9');
    await page.waitForTimeout(400);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('#answer-input').inputValue(), '7/9');
    assert.match(await page.locator('.question-top').innerText(), /ЗАДАНИЕ 2 ИЗ 8/);
    await page.locator('[data-action="theory"]').first().click();
    assert.equal(await page.locator('#modal').evaluate((x) => x.open), true);
    await page.locator('[data-action="close-modal"]').first().click();
  });
  await scenario(
    'Завершение с пропусками, отчёт, предпросмотр, экспорт и Telegram off',
    async () => {
      await page.locator('[data-action="finish-work"]').click();
      await page.locator('[data-action="confirm-finish"]').click();
      await page.waitForURL(/#\/result\//);
      assert.match(await page.locator('.result-facts').innerText(), /Оценка 2/);
      assert.equal(await page.locator('.report-task').count(), 8);
      assert.equal(await page.locator('#send-report').isDisabled(), true);
      await page.locator('#send-consent').check();
      assert.equal(await page.locator('#send-report').isDisabled(), true);
      await page.locator('[data-action="preview-message"]').click();
      assert.match(await page.locator('#modal').innerText(), /Саша <b>&/);
      assert.equal(await page.locator('#modal script').count(), 0);
      await page.locator('[data-action="close-modal"]').first().click();
      const download = page.waitForEvent('download');
      await page.locator('[data-action="download-report"][data-format="txt"]').click();
      assert.match((await download).suggestedFilename(), /\.txt$/);
      assert.equal((await saved(page)).sessions[0].status, 'finished');
      assert.equal(externalRequests, 0);
      await page.screenshot({ path: path.join(artifact, 'result-desktop.png'), fullPage: false });
    }
  );
  await scenario(
    'Выбор, выражение, координаты, доказательство-последовательность и текст учителю',
    async () => {
      for (const [lesson, type] of [
        ['a10', 'choice'],
        ['a38', 'expression'],
        ['a19', 'coordinates'],
        ['g08', 'sequence'],
        ['a02', 'fraction'],
        ['a16', 'list'],
        ['g26', 'text'],
      ]) {
        const work = getWork(lesson, 'practice', 'types'),
          index = work.findIndex((q) => q.type === type);
        assert.ok(index >= 0, `${lesson}: ${type}`);
        await goto(page, `train/${lesson}?work=practice&variant=types`);
        await page.locator(`[data-action="go-question"][data-index="${index}"]`).click();
        const q = work[index];
        if (type === 'sequence') {
          for (const number of q.answer.split(';').map((s) => s.trim()))
            await page.locator(`[data-action="sequence-add"][data-number="${number}"]`).click();
          await page.locator('#answer-form button[type=submit]').click();
          await page.locator('.manual-details summary').click();
          await page.locator('#manual-comment').fill('Треугольники равны по СУС.');
          assert.equal(
            (await saved(page)).sessions.find((s) => s.lessonId === lesson).answers[q.id]
              .manualComment,
            'Треугольники равны по СУС.'
          );
        } else await submit(page, q, q.answer);
        assert.equal(
          await page.locator('#answer-feedback').getAttribute('data-kind'),
          'correct',
          type
        );
      }
    }
  );
  await scenario('Комплексная практика: отдельный вход, 24 темы и пошаговые разборы', async () => {
    await goto(page, 'challenge');
    assert.equal(await page.locator('.module-card').count(), 3);
    assert.equal(await page.locator('.lesson-title-link').count(), 24);
    assert.equal(await page.locator('.is-challenge').count(), 3);
    await page.screenshot({ path: path.join(artifact, 'complex-catalog.png'), fullPage: false });
    for (const lesson of lessons.filter((l) => l.challenge)) {
      await goto(page, `train/${lesson.id}?work=practice&variant=complex-browser`);
      const q = getWork(lesson.id, 'practice', 'complex-browser')[0];
      assert.equal(await page.locator('.complex-task-label').count(), 1);
      await submit(page, q, q.answer);
      assert.equal(
        await page.locator('#answer-feedback').getAttribute('data-kind'),
        'correct',
        q.id
      );
      await page.locator('[data-action="solution"]').click();
      assert.equal(
        await page.locator('#question-pane .solution-steps li').count(),
        q.solutionSteps.length
      );
      assert.equal(await page.locator('.manual-details').count(), 1);
    }
    await goto(page, 'train/a74?work=classwork&variant=complex-full');
    const work = getWork('a74', 'classwork', 'complex-full');
    for (let i = 0; i < work.length; i++) {
      await submit(page, work[i], work[i].answer);
      if (i < work.length - 1) await page.locator('[data-action="next-question"]').click();
    }
    await page.locator('[data-action="finish-work"]').click();
    await page.waitForURL(/#\/result\//);
    assert.match(await page.locator('.result-facts').innerText(), /Оценка 5/);
    assert.equal(await page.locator('.report-task').count(), 8);
    assert.equal(await page.locator('.solution-steps').count(), 8);
    const download = page.waitForEvent('download');
    await page.locator('[data-action="download-report"][data-format="txt"]').click();
    const downloaded = await download;
    assert.match(await readFile(await downloaded.path(), 'utf8'), /Разбор по шагам/);
  });
  await scenario('Комплексные условия и разборы читаются на телефоне 390/320', async () => {
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      for (const route of [
        'challenge',
        'lesson/a61',
        'train/a59?work=practice&variant=complex-mobile',
        'train/a70?work=practice&variant=complex-mobile',
        'train/g43?work=practice&variant=complex-mobile',
      ]) {
        await goto(page, route);
        await noOverflow(page);
      }
    }
    await page.screenshot({ path: path.join(artifact, 'complex-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await goto(page, 'catalog');
    await page.locator('.challenge-banner [data-action="reset-filters"]').click();
    assert.equal(await page.locator('.module-card').count(), 18);
  });
  await scenario('Все 128 страниц уроков и основные разделы открываются без ошибок', async () => {
    for (const l of lessons) {
      await goto(page, `lesson/${l.id}`);
      assert.equal(await page.locator('h1').innerText(), l.title);
      assert.equal(await page.locator('.work-card').count(), 2);
    }
    for (const route of ['stats', 'homework', 'theory', 'program', 'settings', 'privacy']) {
      await goto(page, route);
      assert.equal(await page.locator('h1').count(), 1);
      await noOverflow(page);
    }
    await goto(page, 'settings');
    assert.equal(await page.locator('#test-telegram').isDisabled(), true);
    await page.locator('[name="five"]').fill('91');
    await page.locator('#grading-form button').click();
    assert.equal((await saved(page)).preferences.grading.five, 91);
  });
  await scenario(
    'Мобильная версия 390 и 320: меню, тренажёр, результат и программа без горизонтального скролла',
    async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await goto(page);
      await noOverflow(page);
      await page.screenshot({ path: path.join(artifact, 'catalog-mobile.png'), fullPage: false });
      await page.locator('[data-action="open-menu"]').click();
      assert.equal(
        await page.locator('#sidebar').evaluate((x) => x.classList.contains('is-open')),
        true
      );
      await page.locator('#sidebar a[href="#/stats"]').click();
      assert.equal(
        await page.locator('#sidebar').evaluate((x) => x.classList.contains('is-open')),
        false
      );
      await goto(page, 'train/g15?work=classwork&variant=mobile');
      const di = getWork('g15', 'classwork', 'mobile').findIndex((q) => q.diagram);
      await page.locator(`[data-action="go-question"][data-index="${di}"]`).click();
      await noOverflow(page);
      assert.equal(await page.locator('.task-figure svg').count(), 1);
      await page.screenshot({ path: path.join(artifact, 'trainer-mobile.png'), fullPage: true });
      await page.locator('[data-action="finish-work"]').click();
      await page.locator('[data-action="confirm-finish"]').click();
      await page.waitForURL(/#\/result\//);
      await noOverflow(page);
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        for (const route of ['catalog', 'program', 'stats', 'settings', 'theory', 'privacy']) {
          await goto(page, route);
          await noOverflow(page);
        }
      }
    }
  );
  await scenario(
    'Повреждённое и заблокированное хранилище: понятный безопасный fallback',
    async () => {
      const broken = await browser.newContext();
      await broken.addInitScript(() =>
        localStorage.setItem(
          'tetrad7:state:v1',
          '{"version":1,"sessions":[{"id":"bad","lessonId":"g99"}]}'
        )
      );
      const p = await broken.newPage();
      observe(p);
      await goto(p);
      assert.equal(await p.locator('.module-card').count(), 18);
      await broken.close();
      const blocked = await browser.newContext();
      await blocked.addInitScript(() =>
        Object.defineProperty(window, 'localStorage', {
          get() {
            throw new Error('blocked');
          },
        })
      );
      const p2 = await blocked.newPage();
      observe(p2);
      await goto(p2);
      assert.match(await p2.locator('.notice').innerText(), /не разрешил сохранение/);
      assert.equal(await p2.locator('.module-card').count(), 18);
      await blocked.close();
    }
  );
  await scenario(
    'Клиентский proxy: согласие, один fetch, подтверждение и защита от повторного клика',
    async () => {
      const proxy = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      let requests = 0;
      await proxy.route('**/config.js', async (route) => {
        const source = await readFile(path.join(site, 'config.js'), 'utf8');
        await route.fulfill({
          contentType: 'application/javascript',
          body: source
            .replace(/mode:\s*['"]off['"]/g, "mode: 'proxy'")
            .replace('__TELEGRAM_PROXY_URL__', 'https://proxy.example/report'),
        });
      });
      await proxy.route('https://proxy.example/report', async (route) => {
        requests++;
        assert.ok(JSON.parse(route.request().postData()).report);
        await route.fulfill({
          contentType: 'application/json',
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ ok: true, messageId: 42 }),
        });
      });
      const p = await proxy.newPage();
      observe(p);
      await goto(p, 'train/a11?work=homework&variant=send');
      await p.locator('#student-name').fill('Тестовый ученик');
      await p.locator('#profile-form button').click();
      await p.locator('[data-action="finish-work"]').click();
      await p.locator('[data-action="confirm-finish"]').click();
      await p.waitForURL(/#\/result\//);
      assert.equal(await p.locator('#send-report').isDisabled(), true);
      await p.locator('#send-consent').check();
      await p.locator('#send-report').click();
      await p.waitForSelector('.badge.sent');
      assert.equal(requests, 1);
      assert.equal(await p.locator('#send-report').isDisabled(), true);
      await p.reload({ waitUntil: 'networkidle' });
      assert.equal(await p.locator('#send-report').isDisabled(), true);
      assert.equal(requests, 1);
      await proxy.close();
    }
  );
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(artifact, 'e2e-summary.json'),
    JSON.stringify({ passed: results.length, scenarios: results, consoleErrors: errors }, null, 2)
  );
  console.log(`\nE2E: ${results.length} сценариев; ошибок браузера: ${errors.length}.`);
} catch (error) {
  if (activePage && !activePage.isClosed())
    await activePage
      .screenshot({ path: path.join(artifact, 'failure.png'), fullPage: true })
      .catch(() => {});
  await writeFile(
    path.join(artifact, 'failure.txt'),
    String(error.stack) + '\n' + JSON.stringify(errors, null, 2)
  );
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
