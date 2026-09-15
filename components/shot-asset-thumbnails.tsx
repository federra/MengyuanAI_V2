'use client';
import Image from 'next/image';
import { ImageIcon, Plus, X } from 'lucide-react';
import type { Asset, Media } from '@/lib/studio';

export function ShotAssetThumbnails({
  kind,
  assets,
  onPick,
  onRemove,
  onPreview,
}: {
  kind: string;
  assets: Asset[];
  onPick: () => void;
  onRemove: (id: string) => void;
  onPreview: (media: Media, name: string) => void;
}) {
  const label = kind === '人物' ? '角色' : kind;
  return (
    <section className="shot-asset-thumbnails" aria-label={`已绑定${label}`}>
      <div className="shot-asset-thumbnails-heading">
        <span>{label}</span>
        <span>{assets.length}</span>
      </div>
      <div className="shot-asset-thumbnail-grid">
        {assets.map((asset) => {
          const media = asset.image || asset.referenceImage;
          return (
            <div className="shot-asset-thumbnail" key={asset.id}>
              <button
                type="button"
                className="shot-asset-image"
                title={
                  media
                    ? `预览${asset.name}${asset.image ? '' : '参考图'}`
                    : `${asset.name} · 尚未配图，点击管理引用`
                }
                aria-label={
                  media ? `预览${asset.name}` : `${asset.name}尚未配图`
                }
                onClick={() =>
                  media ? onPreview(media, asset.name) : onPick()
                }
              >
                {media ? (
                  <Image
                    unoptimized
                    src={media.url}
                    alt={asset.name}
                    width={60}
                    height={60}
                  />
                ) : (
                  <span>
                    <ImageIcon size={20} />
                    <small>未配图</small>
                  </span>
                )}
              </button>
              <button
                type="button"
                className="shot-asset-unlink"
                title={`解除${asset.name}的镜头引用`}
                aria-label={`解除${asset.name}的镜头引用`}
                onClick={() => onRemove(asset.id)}
              >
                <X size={12} />
              </button>
              <span className="shot-asset-thumbnail-name" title={asset.name}>
                {asset.name}
              </span>
            </div>
          );
        })}
        <button
          type="button"
          className="shot-asset-add"
          onClick={onPick}
          aria-label={`添加参考${label}`}
        >
          <Plus size={18} />
          <span>参考{label}</span>
        </button>
      </div>
    </section>
  );
}
