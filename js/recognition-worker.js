import { luminance, extractPaper, traceContours } from './recognition.mjs';
let gray, width, height;
self.onmessage = ({ data }) => {
  const { id, threshold } = data;
  try {
    if (data.rgba) { gray = luminance(data.rgba); width = data.width; height = data.height; }
    const result = extractPaper(gray, width, height, threshold);
    const contours = traceContours(result.mask, width, height);
    self.postMessage({ id, ...result, contours }, [result.mask.buffer]);
  } catch (error) { self.postMessage({ id, error: error.message }); }
};
