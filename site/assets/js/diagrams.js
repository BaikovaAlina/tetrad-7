import { esc } from './ui.js';
const ink = '#385d4d',
  soft = '#95a99f',
  purple = '#80759f';
const line = (x1, y1, x2, y2, extra = '') =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${ink}" stroke-width="2" ${extra}/>`;
const text = (x, y, s, extra = '') =>
  `<text x="${x}" y="${y}" fill="${ink}" font-size="14" font-family="Manrope,Arial,sans-serif" text-anchor="middle" ${extra}>${esc(s)}</text>`;
const point = (x, y) => `<circle cx="${x}" cy="${y}" r="3" fill="${ink}"/>`;
const wrap = (body, label) =>
  `<figure class="task-figure"><svg viewBox="0 0 340 220" role="img" aria-label="${esc(label)}">${body}</svg><figcaption>Чертёж схематический, не в масштабе</figcaption></figure>`;
export function renderDiagram(d) {
  if (!d) return '';
  let s = '';
  if (d.kind === 'segment') {
    const p = d.points || ['A', 'B', 'C'];
    s = line(35, 105, 305, 105);
    [35, 150, 305].forEach((x, i) => (s += line(x, 100, x, 110) + text(x, 89, p[i])));
    s += text(92, 134, d.labels?.[0] || '?') + text(225, 134, d.labels?.[1] || '?');
    return wrap(s, 'Три отмеченные точки на отрезке');
  }
  if (d.kind === 'triangle') {
    let p = { A: [170, 28], B: [45, 178], C: [295, 178] };
    if (d.angles) {
      const [a, b] = d.angles.map((x) => (x * Math.PI) / 180),
        height = (250 * Math.tan(a) * Math.tan(b)) / (Math.tan(a) + Math.tan(b));
      const scale = Math.min(1, 135 / height);
      p = {
        A: [45, 180],
        B: [45 + 250 * scale, 180],
        C: [45 + (height / Math.tan(a)) * scale, 180 - height * scale],
      };
    }
    s = `<path d="M${p.A.join(',')}L${p.B.join(',')}L${p.C.join(',')}Z" fill="#edf4ef" stroke="${ink}" stroke-width="2.2"/>`;
    for (const [name, [x, y]] of Object.entries(p)) {
      const top = y < 100;
      s += text(
        x + (name === 'B' && d.angles ? 12 : 0),
        top ? y - 10 : y + 23,
        name,
        'font-style="italic"'
      );
      const label = d.labels?.[name];
      if (label)
        s += text(
          x +
            (d.angles
              ? name === 'A'
                ? 28
                : name === 'B'
                  ? -28
                  : 0
              : name === 'B'
                ? 24
                : name === 'C'
                  ? -24
                  : 0),
          top ? y + 36 : y - 17,
          label
        );
    }
    if (d.median) {
      const mx = (p.B[0] + p.C[0]) / 2,
        my = (p.B[1] + p.C[1]) / 2;
      s += line(...p.A, mx, my, `stroke-dasharray="5 4"`) + text(mx, my + 23, 'D');
    }
    if (d.isosceles) {
      s += line(97, 99, 106, 105) + line(234, 105, 243, 99);
    }
    return wrap(s, 'Треугольник ABC с обозначенными элементами');
  }
  if (d.kind === 'right') {
    s =
      `<path d="M45 30V178H295Z" fill="#edf4ef" stroke="${ink}" stroke-width="2.2"/>` +
      `<path d="M45 162h16v16" fill="none" stroke="${ink}" stroke-width="1.5"/>` +
      text(38, 21, 'A') +
      text(308, 187, 'B') +
      text(33, 196, 'C');
    const labels = d.sideLabels || {};
    if (labels.AB) s += text(185, 90, labels.AB);
    if (labels.BC) s += text(173, 203, labels.BC);
    if (labels.AC) s += text(25, 110, labels.AC);
    if (d.median)
      s += line(45, 178, 170, 104, `stroke-dasharray="5 4"`) + point(170, 104) + text(175, 93, 'M');
    return wrap(s, 'Прямоугольный треугольник ABC, прямой угол C');
  }
  if (d.kind === 'angle') {
    const deg = d.value || 80,
      r = (deg * Math.PI) / 180,
      o = [75, 174],
      radius = 145;
    const bx = o[0] + radius * Math.cos(r),
      by = o[1] - radius * Math.sin(r);
    s =
      line(...o, 300, 174) +
      line(...o, bx, by) +
      text(305, 194, 'A') +
      text(bx, by - 10, 'B') +
      text(65, 197, 'O');
    const ex = o[0] + 55 * Math.cos(r),
      ey = o[1] - 55 * Math.sin(r);
    s +=
      `<path d="M130 174A55 55 0 0 0 ${ex} ${ey}" fill="none" stroke="${purple}" stroke-width="1.5"/>` +
      text(o[0] + 80 * Math.cos(r / 2), o[1] - 80 * Math.sin(r / 2), `${deg}°`);
    if (d.bisector) {
      s += line(
        ...o,
        o[0] + 170 * Math.cos(r / 2),
        o[1] - 170 * Math.sin(r / 2),
        `stroke-dasharray="5 4"`
      );
      s += text(o[0] + 185 * Math.cos(r / 2), o[1] - 185 * Math.sin(r / 2), 'C');
    }
    if (d.part) {
      const pr = (d.part * Math.PI) / 180;
      s +=
        line(...o, o[0] + 160 * Math.cos(pr), o[1] - 160 * Math.sin(pr), `stroke-dasharray="5 4"`) +
        text(205, 95, 'C');
    }
    return wrap(s, 'Угол AOB и вспомогательный луч');
  }
  if (d.kind === 'adjacent' || d.kind === 'cross') {
    const angle = d.value || 70,
      r = (angle * Math.PI) / 180,
      c = [170, 115];
    s =
      line(30, 115, 310, 115) +
      line(
        c[0] - 100 * Math.cos(r),
        c[1] + 100 * Math.sin(r),
        c[0] + 100 * Math.cos(r),
        c[1] - 100 * Math.sin(r)
      );
    s +=
      text(210, 95, `${angle}°`) +
      text(120, d.kind === 'cross' ? 145 : 95, '?') +
      text(165, 138, 'O');
    return wrap(s, 'Углы при пересечении прямых');
  }
  if (d.kind === 'parallel') {
    s =
      line(30, 65, 310, 65) +
      line(30, 157, 310, 157) +
      line(242, 15, 98, 205) +
      text(317, 69, 'a') +
      text(317, 161, 'b') +
      text(244, 18, 'c') +
      text(d.pair === 'same' ? 243 : 165, 94, `${d.value}°`) +
      text(168, 143, '?');
    return wrap(s, 'Параллельные прямые a, b и секущая c');
  }
  if (d.kind === 'perpendicular') {
    s =
      line(30, 178, 310, 178) +
      line(110, 35, 110, 178) +
      line(110, 35, 265, 178) +
      `<path d="M110 164h14v14" fill="none" stroke="${ink}"/>` +
      text(107, 25, 'P') +
      text(105, 202, 'H') +
      text(269, 202, 'A') +
      text(85, 110, String(d.height || '?'));
    return wrap(s, 'Перпендикуляр PH и наклонная PA к прямой');
  }
  if (['circle', 'tangent', 'chord'].includes(d.kind)) {
    s =
      `<circle cx="165" cy="105" r="70" fill="#edf4ef" stroke="${ink}" stroke-width="2"/>` +
      point(165, 105) +
      text(151, 100, 'O');
    if (d.kind === 'tangent')
      s +=
        line(40, 175, 305, 175) +
        line(165, 105, 165, 175) +
        `<path d="M165 162h13v13" fill="none" stroke="${ink}"/>` +
        text(164, 199, 'T') +
        text(308, 169, 't') +
        text(145, 143, String(d.radius || '?'));
    else if (d.kind === 'chord')
      s +=
        line(104.38, 140, 225.62, 140) +
        line(165, 35, 165, 175) +
        `<path d="M165 128h12v12" fill="none" stroke="${ink}"/>` +
        text(98, 157, 'A') +
        text(232, 157, 'B') +
        text(153, 157, 'M');
    else
      s +=
        line(95, 105, 235, 105) +
        text(205, 96, d.radius ? `r = ${d.radius}` : d.diameter ? `d = ${d.diameter}` : 'r');
    return wrap(
      s,
      d.kind === 'tangent'
        ? 'Радиус и касательная в точке T'
        : d.kind === 'chord'
          ? 'Хорда AB и перпендикулярный ей диаметр'
          : 'Окружность с центром O'
    );
  }
  if (d.kind === 'grid-rect') {
    const step = Math.min(18, 270 / d.width, 150 / d.height),
      w = d.width * step,
      h = d.height * step,
      x = (340 - w) / 2,
      y = 20;
    s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#e6eee8" stroke="${ink}"/><rect x="${x}" y="${y}" width="${w}" height="${d.cut * step}" fill="#dfddd5" opacity=".8"/>`;
    for (let i = 1; i < d.width; i++)
      s += line(x + i * step, y, x + i * step, y + h, 'opacity=".2" stroke-width=".5"');
    for (let j = 1; j < d.height; j++)
      s += line(x, y + j * step, x + w, y + j * step, 'opacity=".2" stroke-width=".5"');
    s +=
      text(170, y + (d.cut * step) / 2 + 4, 'вырезали') +
      text(170, y + h + 25, `${d.width} клеток`) +
      text(x - 16, y + h / 2, `${d.height}`);
    return wrap(s, 'Прямоугольник на клетчатой бумаге; серая часть удаляется');
  }
  if (d.kind === 'histogram') {
    const scale = 125 / Math.max(...d.values);
    s = line(42, 175, 315, 175) + line(42, 35, 42, 175);
    d.values.forEach((val, i) => {
      const x = 55 + i * 83;
      s +=
        `<rect x="${x}" y="${175 - val * scale}" width="83" height="${val * scale}" fill="${i === 1 ? '#a296b5' : '#8daf99'}" stroke="${ink}" stroke-width="1"/>` +
        text(x + 41, 164 - val * scale, String(val)) +
        text(x + 41, 198, d.labels[i], 'style="font-size:10px"');
    });
    return wrap(s, 'Гистограмма: равные интервалы и их абсолютные частоты');
  }
  if (d.kind === 'bars') {
    const max = Math.max(...d.values),
      scale = 130 / max;
    s = line(45, 180, 315, 180) + line(45, 35, 45, 180);
    d.values.forEach((val, i) => {
      const x = 75 + i * 80;
      s +=
        `<rect x="${x}" y="${180 - val * scale}" width="42" height="${val * scale}" rx="4" fill="${i === 1 ? '#9a91b0' : '#80a88e'}"/>` +
        text(x + 21, 170 - val * scale, String(val)) +
        text(x + 21, 204, d.labels[i]);
    });
    return wrap(s, 'Столбчатая диаграмма значений');
  }
  if (d.kind === 'linear' || d.kind === 'systems' || d.kind === 'absolute') {
    const absolute = d.kind === 'absolute',
      lines = d.lines || [[d.k ?? 1, d.b ?? 0]];
    let xMin = -2,
      xMax = 6,
      yMin = -4,
      yMax = 8;
    if (absolute) {
      xMin = -5;
      xMax = 5;
      yMin = -1;
      yMax = 6;
    } else if (d.kind === 'systems') {
      const [[k1, b1], [k2, b2]] = lines;
      const cross = (b2 - b1) / (k1 - k2);
      xMin = -1;
      xMax = Math.max(5, cross * 1.65);
      yMin = -2;
      yMax = Math.max(8, (k1 * cross + b1) * 1.5);
    } else {
      const [k, b] = lines[0],
        inter = -b / k;
      xMin = Math.min(-2, inter - 2);
      xMax = Math.max(4, inter + 2);
      yMin = Math.min(-3, b - 2, k * xMin + b - 2);
      yMax = Math.max(5, b + 2, k * xMax + b + 2);
    }
    const px = (x) => 42 + ((x - xMin) / (xMax - xMin)) * 270,
      py = (y) => 184 - ((y - yMin) / (yMax - yMin)) * 155;
    for (let i = 0; i <= 5; i++) {
      const x = xMin + ((xMax - xMin) * i) / 5,
        y = yMin + ((yMax - yMin) * i) / 5;
      s +=
        line(px(x), 29, px(x), 184, 'opacity=".12" stroke-width=".6"') +
        line(42, py(y), 312, py(y), 'opacity=".12" stroke-width=".6"');
    }
    const ox = px(0),
      oy = py(0);
    s +=
      line(35, oy, 320, oy) +
      line(ox, 193, ox, 20) +
      text(325, oy + 5, 'x') +
      text(ox + 13, 20, 'y') +
      text(ox - 12, oy + 17, '0');
    s += `<defs><clipPath id="plot-clip"><rect x="42" y="29" width="270" height="155"/></clipPath></defs><g clip-path="url(#plot-clip)">`;
    if (absolute)
      s += `<path d="M${px(xMin)} ${py(Math.abs(xMin))}L${px(0)} ${py(0)}L${px(xMax)} ${py(Math.abs(xMax))}" fill="none" stroke="${ink}" stroke-width="2.5"/>`;
    else
      lines.forEach(
        ([k, b], i) =>
          (s += `<path d="M${px(xMin)} ${py(k * xMin + b)}L${px(xMax)} ${py(k * xMax + b)}" fill="none" stroke="${i ? purple : ink}" stroke-width="2.5"/>`)
      );
    s += '</g>';
    s +=
      text(px(xMax), Math.min(211, oy + 20), Number(xMax.toFixed(1)).toLocaleString('ru-RU')) +
      text(Math.min(321, ox + 18), py(yMax) + 4, Number(yMax.toFixed(1)).toLocaleString('ru-RU'));
    return wrap(
      s,
      absolute
        ? 'График функции y = модуль x'
        : 'Графики линейных функций; масштабы осей могут различаться'
    );
  }
  return '';
}
