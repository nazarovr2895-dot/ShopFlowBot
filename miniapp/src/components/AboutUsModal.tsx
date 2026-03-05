import { useEffect } from 'react';
import { api } from '../api/client';
import './AboutUsModal.css';

interface AboutBlock {
  type: 'text' | 'image' | 'video';
  content?: string;
  url?: string;
  caption?: string;
  align?: 'left' | 'center' | 'right';
}

interface AboutBackground {
  type: 'color' | 'image';
  value?: string;
  url?: string;
}

interface AboutUsModalProps {
  open: boolean;
  onClose: () => void;
  blocks: AboutBlock[];
  background?: AboutBackground | null;
  shopName?: string;
}

function getVideoEmbedUrl(url: string): string | null {
  // YouTube
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
  // VK Video
  const vkMatch = url.match(/vk\.com\/video(-?\d+)_(\d+)/);
  if (vkMatch) return `https://vk.com/video_ext.php?oid=${vkMatch[1]}&id=${vkMatch[2]}`;
  return null;
}

export function AboutUsModal({ open, onClose, blocks, background, shopName }: AboutUsModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  const bgStyle: React.CSSProperties = {};
  if (background?.type === 'color' && background.value) {
    bgStyle.backgroundColor = background.value;
  } else if (background?.type === 'image' && background.url) {
    bgStyle.backgroundImage = `url(${api.getProductImageUrl(background.url) || background.url})`;
    bgStyle.backgroundSize = 'cover';
    bgStyle.backgroundPosition = 'center';
  }

  return (
    <div className="about-modal-overlay" onClick={onClose}>
      <div className="about-modal" style={bgStyle} onClick={e => e.stopPropagation()}>
        <div className="about-modal__header">
          <button className="about-modal__back" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Назад
          </button>
          {shopName && <span className="about-modal__title">О нас</span>}
        </div>
        <div className="about-modal__content">
          {blocks.map((block, i) => {
            if (block.type === 'text' && block.content) {
              return (
                <div key={i} className="about-modal__text" style={{ textAlign: block.align || 'left' }}>
                  {block.content.split('\n').map((line, j) => (
                    <p key={j}>{line}</p>
                  ))}
                </div>
              );
            }
            if (block.type === 'image' && block.url) {
              const src = api.getProductImageUrl(block.url) || block.url;
              return (
                <div key={i} className="about-modal__image-block">
                  <img src={src} alt={block.caption || ''} className="about-modal__image" />
                  {block.caption && <p className="about-modal__caption">{block.caption}</p>}
                </div>
              );
            }
            if (block.type === 'video' && block.url) {
              const embedUrl = getVideoEmbedUrl(block.url);
              if (!embedUrl) return null;
              return (
                <div key={i} className="about-modal__video-block">
                  <div className="about-modal__video-wrapper">
                    <iframe
                      src={embedUrl}
                      title={block.caption || 'Video'}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                  {block.caption && <p className="about-modal__caption">{block.caption}</p>}
                </div>
              );
            }
            return null;
          })}
        </div>
      </div>
    </div>
  );
}
