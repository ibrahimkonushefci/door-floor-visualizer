import type { RoomScene } from '../src/lib/data/types';
import type { StudioCatalog } from '../src/lib/studio/types';
import {
  createMaterialLoader,
  prepareSceneWith,
  sceneLoadFor,
  type DecodeAsset,
} from '../src/lib/studio/asset-loader';
import { bytesNode, decodeNode } from './prepare-scenes';
// First useful bytes are the files the Studio's own loader requests for a room's
// default selection (scene layers, the default door model's region crops, the
// position map and the selected materials), recorded rather than re-derived,
// plus the fallback image the stage shows while they load. Shared by
// verify-budgets (the gate) and profile-studio-assets (informational).
export async function firstLoadUrls(scene: RoomScene, catalog: StudioCatalog) {
  const urls = new Set<string>([scene.fallback]),
    selection = scene.defaultSelection,
    signal = new AbortController().signal;
  const decode: DecodeAsset = (path, s, maxEdge) => {
    urls.add(path);
    return decodeNode(path, s, maxEdge);
  };
  await prepareSceneWith(sceneLoadFor(scene, selection, catalog).scene, signal, decode, {
    modelId: selection.doorModelId,
    loadBytes: path => {
      urls.add(path);
      return bytesNode(path);
    },
  });
  await createMaterialLoader(decode).prepare(selection, catalog, signal);
  return urls;
}
/** Sum of published sizes; fails on any requested file the scene manifest does not publish. */
export function firstLoadBytes(urls: Iterable<string>, sizes: ReadonlyMap<string, number>) {
  let bytes = 0;
  for (const url of urls) {
    const size = sizes.get(url);
    if (size === undefined) throw new Error(`First load requests an unpublished asset: ${url}`);
    bytes += size;
  }
  return bytes;
}
