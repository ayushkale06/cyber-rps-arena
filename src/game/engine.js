  // Handle tie / draw condition
  if (playerMove === cpuMove) {
    return { result: 'DRAW', winner: null, scoreDelta: 0, message: 'Draw: cyber shields matched.' };
  }
