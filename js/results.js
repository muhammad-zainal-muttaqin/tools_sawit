'use strict';

/**
 * Results — counting, display, and export for the active session.
 */

const Results = (() => {

  // ── Counting ───────────────────────────────────────────────────────────────

  function compute(session) {
    const allBboxes = [];
    const sideCounts = {};

    for (const side of session.sides) {
      const label = side.label;
      sideCounts[label] = side.bboxes.length;
      for (const b of side.bboxes) {
        allBboxes.push({ ...b, _sideIndex: side.sideIndex, _sideLabel: label });
      }
    }

    const rawCount = allBboxes.length;

    // Build union-find from confirmed links
    const allIds = allBboxes.map(b => b.id);
    const uf = createUnionFind(allIds);
    let linkedCount = 0;
    for (const link of session.confirmedLinks) {
      const ra = uf.find(link.bboxIdA);
      const rb = uf.find(link.bboxIdB);
      if (ra !== rb) {
        uf.union(link.bboxIdA, link.bboxIdB);
        linkedCount++;
      }
    }

    // Group by cluster
    const clusters = new Map(); // root → [bbox, ...]
    for (const b of allBboxes) {
      const root = uf.find(b.id);
      if (!clusters.has(root)) clusters.set(root, []);
      clusters.get(root).push(b);
    }

    const uniqueCount = clusters.size;

    // Class breakdown by majority vote per cluster
    const classCounts = { B1: 0, B2: 0, B3: 0, B4: 0, other: 0 };
    for (const members of clusters.values()) {
      const votes = {};
      for (const b of members) {
        votes[b.className] = (votes[b.className] || 0) + 1;
      }
      const dominant = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
      if (classCounts[dominant] !== undefined) classCounts[dominant]++;
      else classCounts.other++;
    }

    return { uniqueCount, rawCount, linkedCount, classCounts, sideCounts, clusters };
  }

  // ── Display ────────────────────────────────────────────────────────────────

  function render(result, container) {
    const { uniqueCount, rawCount, linkedCount, classCounts, sideCounts } = result;

    container.innerHTML = `
      <div class="results-stats">
        <div class="stat-card stat-unique">
          <div class="stat-value">${uniqueCount}</div>
          <div class="stat-label">Tandan Unik</div>
        </div>
        <div class="stat-card stat-raw">
          <div class="stat-value">${rawCount}</div>
          <div class="stat-label">Total Deteksi</div>
        </div>
        <div class="stat-card stat-linked">
          <div class="stat-value">${linkedCount}</div>
          <div class="stat-label">Duplikat Ditautkan</div>
        </div>
      </div>

      <div class="results-tables">
        <div class="results-table-block">
          <h3>Per Kelas</h3>
          <table class="data-table">
            <thead><tr><th>Kelas</th><th>Jumlah</th></tr></thead>
            <tbody>
              ${Object.entries(classCounts)
                .filter(([k]) => k !== 'other')
                .map(([k, v]) => `<tr><td><span class="class-chip class-${k.toLowerCase()}">${k}</span></td><td>${v}</td></tr>`)
                .join('')}
            </tbody>
          </table>
        </div>
        <div class="results-table-block">
          <h3>Per Sisi</h3>
          <table class="data-table">
            <thead><tr><th>Sisi</th><th>Bbox</th></tr></thead>
            <tbody>
              ${Object.entries(sideCounts)
                .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  function _download(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  function exportYolo(session) {
    for (const side of session.sides) {
      if (!side.imageWidth) continue;
      const text = toYoloFormat(side.bboxes, side.imageWidth, side.imageHeight);
      const filename = `${session.treeName}_${side.sideIndex + 1}.txt`;
      _download(filename, text, 'text/plain');
    }
  }

  function exportJSON(session, result) {
    const data = {
      ...ActiveSession.toJSON(),
      result: result ? {
        uniqueCount: result.uniqueCount,
        rawCount: result.rawCount,
        linkedCount: result.linkedCount,
        classCounts: result.classCounts,
        sideCounts: result.sideCounts,
      } : null,
      exportedAt: new Date().toISOString(),
    };
    _download(
      `${session.treeName}_session.json`,
      JSON.stringify(data, null, 2),
      'application/json'
    );
  }

  function exportCSV(session, result) {
    if (!result) return;
    const { uniqueCount, rawCount, classCounts } = result;
    const header = 'tree_name,split,unique,raw,B1,B2,B3,B4';
    const row = [
      session.treeName,
      session.split,
      uniqueCount,
      rawCount,
      classCounts.B1 || 0,
      classCounts.B2 || 0,
      classCounts.B3 || 0,
      classCounts.B4 || 0,
    ].join(',');
    _download(`${session.treeName}_result.csv`, header + '\n' + row, 'text/csv');
  }

  return { compute, render, exportYolo, exportJSON, exportCSV };
})();

window.Results = Results;
