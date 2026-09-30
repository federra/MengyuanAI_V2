import type { GenerationJob } from './models';
import type { Asset, Media } from './studio';

export type AssetDisplayImage = {
  media?: Media;
  source: 'applied' | 'generated' | 'reference' | 'none';
};

export function assetDisplayImage(
  asset: Asset,
  jobs: GenerationJob[],
  projectId: string,
): AssetDisplayImage {
  if (asset.image && asset.image.id !== asset.dismissedImageId)
    return { media: asset.image, source: 'applied' };

  const completed = jobs
    .filter(
      (job) =>
        job.projectId === projectId &&
        job.target === 'asset' &&
        job.targetId === asset.id &&
        job.status === 'succeeded' &&
        job.media,
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (completed?.media && completed.media.id !== asset.dismissedImageId)
    return { media: completed.media, source: 'generated' };
  if (asset.referenceImage)
    return { media: asset.referenceImage, source: 'reference' };
  return { source: 'none' };
}
