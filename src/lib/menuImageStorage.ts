import { supabase } from './supabase';
import { config } from './config';
import { MAX_UPLOAD_IMAGE_BYTES, MENU_IMAGE_BUCKET, isValidMenuItemId, managedMenuImagePath, photoDimensions, validateMenuImageFile } from './menuImageRules';

const getClient = () => { if (!supabase) throw new Error('Connect Supabase before uploading restaurant photos.'); return supabase; };

async function convertToWebP(file: File): Promise<Blob> {
  const problem = validateMenuImageFile(file);
  if (problem) throw new Error(problem);
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error('Unable to read this photo. Try a different JPG, PNG, or WebP file.'); }
  try {
    const { width, height } = photoDimensions(bitmap.width,bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width=width;canvas.height=height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Image processing is unavailable in this browser.');
    // Solid backdrop avoids black backgrounds on transparent PNG food photos.
    ctx.fillStyle='#fffaf4'; ctx.fillRect(0,0,width,height);
    ctx.drawImage(bitmap,0,0,width,height);
    const blob = await new Promise<Blob>((resolve,reject)=>{
      canvas.toBlob(result=>result?resolve(result):reject(new Error('Could not optimize this picture.')), 'image/webp', 0.82);
    });
    if (blob.type !== 'image/webp') throw new Error('This browser cannot export WebP. Please use an updated browser.');
    if (blob.size>MAX_UPLOAD_IMAGE_BYTES) throw new Error('Optimized image exceeds 3 MB. Please select a smaller photo.');
    return blob;
  } finally { bitmap.close(); }
}

export type UploadedMenuImage = { url: string; path: string };
/** The caller must first verify admin access; Storage RLS enforces it again. */
export async function uploadMenuImage(file:File,itemId:string):Promise<UploadedMenuImage> {
  if(!isValidMenuItemId(itemId))throw new Error('Save a valid menu item ID before uploading.');
  const image = await convertToWebP(file);
  const path = `items/${itemId}/${crypto.randomUUID()}.webp`;
  const bucket = getClient().storage.from(MENU_IMAGE_BUCKET);
  const {data,error} = await bucket.upload(path,image,{contentType:'image/webp',cacheControl:'3600',upsert:false});
  if(error)throw new Error(`Photo upload failed: ${error.message}`);
  const {data:publicData}=bucket.getPublicUrl(data.path);
  return {url:publicData.publicUrl,path:data.path};
}

/** Never remove Unsplash references, third-party URLs or another item's photo. */
export async function deleteManagedMenuImage(url:string,itemId:string):Promise<boolean> {
  const path=managedMenuImagePath(url,itemId,config.supabaseUrl);
  if(!path)return false;
  const {error}=await getClient().storage.from(MENU_IMAGE_BUCKET).remove([path]);
  if(error)throw new Error(`Photo cleanup failed: ${error.message}`);
  return true;
}
