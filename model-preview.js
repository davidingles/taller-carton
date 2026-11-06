'use strict';

class FoldedPreview {
  static models = {
    '0200': { size: [180, 120, 120], flaps: [60, 60, 60, 60], openBottom: true },
    '0201': { size: [180, 120, 120], flaps: [60, 60, 60, 60] },
    '0202': { size: [180, 120, 120], flaps: [80, 80, 80, 80] },
    '0203': { size: [180, 120, 120], flaps: [120, 120, 120, 120] },
    '0204': { size: [180, 120, 120], flaps: [60, 90, 60, 90] },
    '0401': { size: [200, 140, 40], flaps: [70, 0, 70, 0] },
    '0426': { size: [172, 128, 38], lid: true },
    '0427': { size: [184, 133, 39], lid: true },
    '0451': { size: [200, 140, 40] },
    '0452': { size: [200, 140, 40] },
    'ARM-01': { size: [160, 94, 214], doors: 1 },
    'ARM-02': { size: [208, 92, 242], doors: 2 },
    sample: { size: [140, 60, 140], flaps: [56, 56, 56, 56] },
  };

  static identify(name) {
    const value = name.toUpperCase();
    if (value === 'PRUEBA-TROQUEL.SVG') return 'sample';
    const code = value.match(/\b(?:FEFCO[\s_-]*(\d{4})|(ARM-0[12]))\b/);
    return code?.[1] ?? code?.[2] ?? value.replace(/\.SVG$/, '');
  }

  constructor(svg, placeholder, hint) {
    this.svg = svg;
    this.placeholder = placeholder;
    this.hint = hint;
  }

  show(code, hasSvg = false) {
    const model = Object.hasOwn(FoldedPreview.models, code) ? FoldedPreview.models[code] : undefined;
    this.svg.replaceChildren();
    this.svg.toggleAttribute('hidden', !model);
    this.placeholder.hidden = Boolean(model);
    if (!model) {
      this.hint.textContent = hasSvg ? 'Modelo sin vista 3D asociada' : 'Elige un modelo para verlo montado';
      return;
    }
    this.draw(model);
  }

  draw(model) {
    const [width, depth, height] = model.size;
    const x = width / 2;
    const y = depth / 2;
    const corners = [[-x, -y], [x, -y], [x, y], [-x, y]];
    const bottom = corners.map(([a, b]) => [a, b, 0]);
    const top = corners.map(([a, b]) => [a, b, height]);
    const faces = [];
    const add = (color, points) => faces.push({ color, points });
    if (!model.openBottom) add('#b68751', bottom);

    for (const [index, color] of ['#d3a975', '#b8834d', '#d7ae7d', '#e4bd8a'].entries()) {
      if (model.doors && index === 2) continue;
      const next = (index + 1) % 4;
      add(color, [bottom[index], bottom[next], top[next], top[index]]);

      const flap = model.flaps?.[index];
      if (!flap) continue;
      const outward = [[0, -1], [1, 0], [0, 1], [-1, 0]][index];
      const outer = ([a, b]) => [a + outward[0] * flap * .86, b + outward[1] * flap * .86, height + flap * .5];
      add('#edc693', [top[index], top[next], outer(top[next]), outer(top[index])]);
    }

    if (model.lid) {
      const hingeY = -y - depth * .4;
      const hingeZ = height + depth * .92;
      add('#e7bd89', [top[0], top[1], [x, hingeY, hingeZ], [-x, hingeY, hingeZ]]);
      add('#d4a671', [
        [-x, hingeY, hingeZ], [x, hingeY, hingeZ],
        [x, hingeY - height * .85, hingeZ - height * .36], [-x, hingeY - height * .85, hingeZ - height * .36],
      ]);
    }

    if (model.doors) {
      add('#ce9d65', top);
      add('#d5ab79', corners.map(([a, b]) => [a, b, height * .49]));
      const hinges = model.doors === 1 ? [-1] : [-1, 1];
      for (const side of hinges) {
        const hingeX = side * x;
        const leaf = width / model.doors;
        const edgeX = hingeX + side * leaf * .26;
        const edgeY = y + leaf * .96;
        add('#e6bb85', [[hingeX, y, 0], [edgeX, edgeY, 0], [edgeX, edgeY, height], [hingeX, y, height]]);
      }
    }

    const project = ([a, b, c]) => [(a - b) * .8, (a + b) * .4 - c * .88];
    const score = face => face.points.reduce((sum, [a, b, c]) => sum + a + b + c * .91, 0) / face.points.length;
    faces.sort((a, b) => score(a) - score(b));
    const projected = faces.map(face => face.points.map(project));
    const points = projected.flat();
    const xs = points.map(([a]) => a);
    const ys = points.map(([, b]) => b);
    const left = Math.min(...xs);
    const topEdge = Math.min(...ys);
    const spanX = Math.max(...xs) - left;
    const spanY = Math.max(...ys) - topEdge;
    const padding = Math.max(spanX, spanY) * .12;
    this.svg.setAttribute('viewBox', [left - padding, topEdge - padding, spanX + padding * 2, spanY + padding * 2].join(' '));
    for (const [index, face] of faces.entries()) {
      const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      polygon.setAttribute('points', projected[index].map(point => point.join(',')).join(' '));
      polygon.setAttribute('fill', face.color);
      polygon.setAttribute('vector-effect', 'non-scaling-stroke');
      this.svg.append(polygon);
    }
  }
}
