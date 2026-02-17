const TREE_SIDE_LABELS = ['Depan', 'Kanan', 'Belakang', 'Kiri'];

function createTreeSide(sideIndex) {
  return {
    sideIndex,
    label: TREE_SIDE_LABELS[sideIndex],
    file: null,
    previewUrl: '',
    detections: [],
  };
}

const TreeSessionStore = {
  createSession() {
    return {
      sessionId: 'tree-' + Date.now(),
      createdAt: new Date().toISOString(),
      captureMode: 'guided-4-side',
      sides: [0, 1, 2, 3].map((idx) => createTreeSide(idx)),
      dedup: {
        autoMergedPairs: [],
        ambiguousPairs: [],
        userDecisions: {},
      },
      result: null,
    };
  },

  resetSession(session) {
    if (!session || !session.sides) return this.createSession();
    session.sides.forEach((side) => {
      if (side.previewUrl) {
        URL.revokeObjectURL(side.previewUrl);
      }
    });
    return this.createSession();
  },

  setSideFile(session, sideIndex, file) {
    const side = session.sides[sideIndex];
    if (!side) return;
    if (side.previewUrl) {
      URL.revokeObjectURL(side.previewUrl);
    }
    side.file = file;
    side.previewUrl = URL.createObjectURL(file);
    side.detections = [];
  },

  setSideDetections(session, sideIndex, detections) {
    const side = session.sides[sideIndex];
    if (!side) return;
    side.detections = Array.isArray(detections) ? detections : [];
  },

  allSidesReady(session) {
    return session.sides.every((side) => !!side.file);
  },

  getFiles(session) {
    return session.sides.map((side) => side.file);
  },

  setDedupArtifacts(session, dedup) {
    session.dedup = {
      autoMergedPairs: dedup.autoMergedPairs || [],
      ambiguousPairs: dedup.ambiguousPairs || [],
      userDecisions: {},
    };
  },

  setUserDecisions(session, decisions) {
    session.dedup.userDecisions = { ...decisions };
  },

  setResult(session, result) {
    session.result = result;
  },
};

window.TreeSessionStore = TreeSessionStore;
window.TREE_SIDE_LABELS = TREE_SIDE_LABELS;
