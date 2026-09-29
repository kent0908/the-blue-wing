/** User-approved public official previews. Never accept request-supplied blob paths. */
const covers: Record<string, string> = {
 "-108": "generations/1/image-1790646361585-Q9BzLSsvprkswKPNfML7lCzcjsGH3U.png",
 "-109": "generations/1/image-1790645957623-YinRKLrcvrrjJytMYcvvBOjgHwP7Sa.png",
 "-110": "generations/1/image-1790646418556-HXdFrkegqr9otuS10Out4Wl7ZYzD93.png",
 "-111": "generations/1/image-1790646375823-qR7jfi9SpS7dfuVWry5mAaGofGPq9f.png",
};
export function publishedCoverPath(id: string): string | undefined {
 return Object.hasOwn(covers, id) ? covers[id] : undefined;
}
