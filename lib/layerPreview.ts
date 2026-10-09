/** Match MaskPainter's stacked/mobile and three-column/desktop layouts. */
export function fitMaskPreview(width: number, height: number, viewportWidth: number, viewportHeight: number) {
  const desktop = viewportWidth >= 1024;
  const availableWidth = Math.max(1, Math.min(900, viewportWidth - (desktop ? 482 : 32)));
  const availableHeight = Math.max(1, desktop ? viewportHeight - 140 : Math.min(480, viewportHeight * 0.45));
  const scale = Math.min(availableWidth / Math.max(1, width), availableHeight / Math.max(1, height), 1);
  return { w: Math.max(1, Math.floor(width * scale)), h: Math.max(1, Math.floor(height * scale)) };
}
