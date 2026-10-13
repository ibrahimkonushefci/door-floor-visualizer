import type { DoorModelPatch, RoomScene, TrimMode } from '../data/types';
// Door models a scene can show. Rendered scenes list theirs (the first is the
// scene's own layers); photo scenes show the one door they were authored with,
// plus the all-glass door when they carry a glass insert.
export function sceneModelIds(scene: RoomScene): string[] {
  const ids = scene.doorModels?.map(m => m.modelId) ?? [
    scene.frameType === 'concealed-aluminium' ? 'filomuro' : 'flat',
  ];
  return scene.doorInserts.length ? [...ids, 'all-glass'] : ids;
}
const isDefault = (scene: RoomScene, modelId: string) => scene.doorModels?.[0]?.modelId === modelId;
/** Crops that turn any model of this scene into `modelId` (the default model has them too). */
export function switchPatch(scene: RoomScene, modelId: string): DoorModelPatch | null {
  return scene.doorModels?.find(m => m.modelId === modelId)?.patch ?? null;
}
/** Crops to paste over the scene's own (default) layers; null for the default model. */
export function modelPatch(scene: RoomScene, modelId: string): DoorModelPatch | null {
  return isDefault(scene, modelId) ? null : switchPatch(scene, modelId);
}
/** The scene as drawn with one door model: its surfaces, protection and frame rules. */
export function sceneForModel(scene: RoomScene, modelId: string): RoomScene {
  const model = scene.doorModels?.find(m => m.modelId === modelId);
  if (!model?.patch || isDefault(scene, modelId)) return scene;
  return {
    ...scene,
    frameType: model.frameType,
    surfaces: model.patch.surfaces,
    protectedMask: model.patch.protectedMask,
    allowedFrameModes: model.patch.allowedFrameModes,
  };
}
export function allowedFrameModes(scene: RoomScene, modelId: string): readonly TrimMode[] {
  return sceneForModel(scene, modelId).allowedFrameModes;
}
