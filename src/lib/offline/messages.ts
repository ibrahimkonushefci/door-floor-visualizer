export type OfflineState = 'unsupported'|'online'|'offline'|'saving'|'ready'|'update-available'|'error';
export interface OfflineProgress { done:number; total:number; bytes:number }
export interface OfflineAsset {url:string;bytes:number;sha256:string}
export interface OfflineManifest {schemaVersion:1;brandId:string;buildId:string;sourceHash:string;maxStudioDownloadBytes:number;shell:OfflineAsset[];studio:OfflineAsset[];studioBytes:number}
export type WorkerCommand = {type:'STATUS'|'SAVE_STUDIO'|'CANCEL_SAVE'|'REMOVE_STUDIO'|'ACTIVATE'|'CLIENT_BUILD';requestId?:string;buildId?:string};
export interface WorkerReply {type:'PROGRESS'|'READY'|'STATUS'|'ERROR'|'CANCELLED';progress?:OfflineProgress;ready?:boolean;buildId?:string;error?:string}
