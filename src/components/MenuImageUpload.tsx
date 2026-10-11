import { useEffect, useRef, useState } from 'react';
import { ImagePlus, RotateCcw, Trash2, UploadCloud } from 'lucide-react';
import { referenceImageFor } from '../data/referenceImages';
import { validateMenuImageFile } from '../lib/menuImageRules';
import type { MenuItem } from '../types';

type Props = {
  item: MenuItem;
  pendingFile: File | null;
  onFileChange: (file:File|null)=>void;
  onUrlChange: (url:string)=>void;
  live: boolean;
  disabled: boolean;
};

export default function MenuImageUpload({item,pendingFile,onFileChange,onUrlChange,live,disabled}:Props){
  const [preview,setPreview]=useState('');
  const [imageError,setImageError]=useState(false);
  const [validationError,setValidationError]=useState('');
  const inputRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{
    if (!pendingFile){setPreview('');return;}
    const url=URL.createObjectURL(pendingFile);
    setPreview(url);
    return ()=>URL.revokeObjectURL(url);
  },[pendingFile]);
  const source=preview || item.image_url || referenceImageFor(item.id);
  const handleSelect=(file:File|undefined)=>{
    if(!file)return;
    const problem=validateMenuImageFile(file);
    if(problem){setValidationError(problem);onFileChange(null);return;}
    setValidationError('');setImageError(false);onFileChange(file);
  };
  const reset=()=>{onFileChange(null);setImageError(false);setValidationError('');if(inputRef.current)inputRef.current.value='';};
  const remove=()=>{reset();onUrlChange('');};
  return <div className="space-y-3 rounded-xl border border-[#ead5c3] p-4 bg-[#fffaf4]" data-testid="menu-image-uploader">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-bold text-base flex items-center gap-2"><ImagePlus size={18} className="text-ember"/> Dish photo</h3><p className="text-xs text-[#816c5d] mt-1">Upload a real restaurant photo or use a reference picture.</p></div><span className="text-[11px] text-[#916b55]">JPG · PNG · WebP</span></div>
    <div className="grid sm:grid-cols-[200px_1fr] gap-4 items-start">
      <div className="aspect-[4/3] rounded-md border border-[#e7d8c7] overflow-hidden bg-[#e6dacd] flex items-center justify-center">
        {source&&!imageError?<img key={source} src={source} onError={()=>setImageError(true)} className="w-full h-full object-cover" alt={`Preview for ${item.name||'new item'}`}/>:<span className="text-sm text-[#9e7964]">Photo preview unavailable</span>}
      </div>
      <div className="space-y-3 min-w-0">
        <label className="field">Choose a food photo<input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" disabled={!live||disabled} onChange={e=>handleSelect(e.target.files?.[0])} className="!text-xs" /></label>
        {pendingFile&&<p className="text-xs text-green-800 break-all"><UploadCloud size={14} className="inline"/> Ready: {pendingFile.name} (uploads when you save)</p>}
        {!live&&<p className="text-xs text-[#986a4b]">Photo uploads need Supabase and an authorized admin. Demo mode still supports image URLs.</p>}
        <p className="text-xs text-[#827366]">Maximum source 6 MB. Converted to optimized WebP (max 3 MB), without changing the original on your device.</p>
        <div className="flex flex-wrap gap-2">
          {pendingFile&&<button type="button" className="btn-secondary !px-3 !py-2" disabled={disabled} onClick={reset}><RotateCcw size={15}/> Cancel selection</button>}
          {(pendingFile||item.image_url)&&<button type="button" className="btn-secondary !px-3 !py-2" disabled={disabled} onClick={remove}><Trash2 size={15}/> Use reference photo</button>}
        </div>
      </div>
    </div>
    <details className="text-xs text-[#79685d]"><summary className="cursor-pointer font-bold">Advanced: external HTTPS photo URL</summary><label className="field mt-3">HTTPS image URL<input type="url" value={item.image_url} placeholder="https://..." disabled={disabled} onChange={e=>{reset();onUrlChange(e.target.value);setImageError(false);}}/></label><p className="mt-2">A selected upload takes precedence when you save. Use photos you have permission to publish.</p></details>
    {validationError&&<p role="alert" className="text-sm text-red-700">{validationError}</p>}
    <p className="text-[11px] text-[#806a5c]">Replacing/removing a managed photo also cleans up its old Storage object after the dish is saved. Other image URLs are never deleted.</p>
  </div>;
}
