function writeAscii(view, offset, text) {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

function clampSample(sample) {
  return Math.max(-1, Math.min(1, sample));
}

export function encodeWav24(channelData, sampleRate) {
  const channelCount = channelData.length;
  const frameCount = channelData[0].length;
  const bytesPerSample = 3;
  const blockAlign = channelCount * bytesPerSample;
  const dataSize = frameCount * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = clampSample(channelData[channel][frame]);
      const value = Math.round(sample * 8388607);
      view.setUint8(offset, value & 0xff);
      view.setUint8(offset + 1, (value >> 8) & 0xff);
      view.setUint8(offset + 2, (value >> 16) & 0xff);
      offset += 3;
    }
  }
  return buffer;
}

export function audioBufferToWav(buffer) {
  const channels = [];
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = new Float32Array(buffer.length);
    buffer.copyFromChannel(data, channel);
    channels.push(data);
  }
  return encodeWav24(channels, buffer.sampleRate);
}

export function readWavInfo(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const format = String.fromCharCode(
    view.getUint8(8),
    view.getUint8(9),
    view.getUint8(10),
    view.getUint8(11),
  );
  if (format !== "WAVE") throw new Error("Not a WAV file");
  return {
    channels: view.getUint16(22, true),
    sampleRate: view.getUint32(24, true),
    bitsPerSample: view.getUint16(34, true),
    frames: view.getUint32(40, true) / (view.getUint16(22, true) * 3),
    duration:
      view.getUint32(40, true) /
      (view.getUint32(28, true) || 1),
    dataSize: view.getUint32(40, true),
    bytes: arrayBuffer.byteLength,
  };
}
