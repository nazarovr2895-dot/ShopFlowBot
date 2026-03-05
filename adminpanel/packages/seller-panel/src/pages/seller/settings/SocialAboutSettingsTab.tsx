import { useState, useCallback, useRef } from 'react';
import { updateMe, uploadAboutMedia, getBannerImageUrl } from '../../../api/sellerClient';
import { FormField, useToast, Toggle } from '@shared/components/ui';
import { Instagram, Send, MessageCircle, Plus, Type, Image, Video, Trash2, ChevronUp, ChevronDown, Eye, X, Moon, Sun } from 'lucide-react';
import { ImageCropModal } from '../../../components/ImageCropModal';
import { getContrastColors } from '../../../utils/colorContrast';
import type { SettingsTabProps } from './types';
import './SocialAboutSettingsTab.css';

const ASPECT_OPTIONS = [
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:2', value: 3 / 2 },
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
];

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

const SOCIAL_PLATFORMS = [
  { key: 'instagram', label: 'Instagram', icon: Instagram, placeholder: 'https://instagram.com/yourshop',
    hint: 'Откройте профиль в Instagram, нажмите «Поделиться профилем» и скопируйте ссылку. Формат: https://instagram.com/ваш_логин' },
  { key: 'telegram', label: 'Telegram', icon: Send, placeholder: 'https://t.me/yourshop',
    hint: 'Откройте Telegram канал/группу, нажмите на название сверху → «Ссылка» и скопируйте. Формат: https://t.me/ваш_канал' },
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, placeholder: 'https://wa.me/79001234567',
    hint: 'Введите ссылку формата https://wa.me/7XXXXXXXXXX (код страны + номер без +, пробелов и скобок)' },
] as const;

export function SocialAboutSettingsTab({ me, reload }: SettingsTabProps) {
  const toast = useToast();

  // Social links state
  const [socialEnabled, setSocialEnabled] = useState(me.social_links_enabled ?? false);
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>(me.social_links ?? {});

  // About state
  const [aboutEnabled, setAboutEnabled] = useState(me.about_enabled ?? false);
  const [blocks, setBlocks] = useState<AboutBlock[]>((me.about_content as AboutBlock[]) ?? []);
  const [background, setBackground] = useState<AboutBackground>((me.about_background as AboutBackground) ?? { type: 'color', value: '#ffffff' });

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<number | null>(null);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [preview, setPreview] = useState(false);
  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark'>('light');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bgFileInputRef = useRef<HTMLInputElement>(null);
  const [pendingBlockIndex, setPendingBlockIndex] = useState<number | null>(null);

  // Crop state
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropAspect, setCropAspect] = useState(1);
  const [cropTarget, setCropTarget] = useState<'block' | 'bg'>('block');

  const updateSocialLink = (key: string, value: string) => {
    setSocialLinks(prev => {
      const next = { ...prev };
      if (value.trim()) next[key] = value.trim();
      else delete next[key];
      return next;
    });
  };

  const addBlock = (type: AboutBlock['type']) => {
    setBlocks(prev => [...prev, { type, content: '', url: '', caption: '', align: 'left' }]);
  };

  const updateBlock = (index: number, updates: Partial<AboutBlock>) => {
    setBlocks(prev => prev.map((b, i) => i === index ? { ...b, ...updates } : b));
  };

  const removeBlock = (index: number) => {
    setBlocks(prev => prev.filter((_, i) => i !== index));
  };

  const moveBlock = (index: number, dir: -1 | 1) => {
    const newIndex = index + dir;
    if (newIndex < 0 || newIndex >= blocks.length) return;
    setBlocks(prev => {
      const next = [...prev];
      [next[index], next[newIndex]] = [next[newIndex], next[index]];
      return next;
    });
  };

  const handleImageUpload = useCallback(async (file: File, index: number) => {
    setUploading(index);
    try {
      const { url } = await uploadAboutMedia(file);
      updateBlock(index, { url });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setUploading(null);
    }
  }, [toast]);

  const handleBgImageUpload = useCallback(async (file: File) => {
    setUploadingBg(true);
    try {
      const { url } = await uploadAboutMedia(file);
      setBackground({ type: 'image', url });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setUploadingBg(false);
    }
  }, [toast]);

  const handleCropComplete = useCallback(async (blob: Blob) => {
    setCropSrc(null);
    const file = new File([blob], `about-${Date.now()}.jpg`, { type: 'image/jpeg' });
    if (cropTarget === 'block' && pendingBlockIndex !== null) {
      await handleImageUpload(file, pendingBlockIndex);
      setPendingBlockIndex(null);
    } else if (cropTarget === 'bg') {
      await handleBgImageUpload(file);
    }
  }, [cropTarget, pendingBlockIndex, handleImageUpload, handleBgImageUpload]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Filter out empty social links
      const filteredLinks: Record<string, string> = {};
      for (const [k, v] of Object.entries(socialLinks)) {
        if (v.trim()) filteredLinks[k] = v.trim();
      }

      // Filter out empty blocks
      const filteredBlocks = blocks.filter(b => {
        if (b.type === 'text') return (b.content || '').trim().length > 0;
        if (b.type === 'image') return !!b.url;
        if (b.type === 'video') return !!b.url;
        return false;
      });

      await updateMe({
        social_links_enabled: socialEnabled,
        social_links: Object.keys(filteredLinks).length > 0 ? filteredLinks : null,
        about_enabled: aboutEnabled,
        about_content: filteredBlocks.length > 0 ? filteredBlocks : null,
        about_background: background,
      });
      await reload();
      toast.success('Настройки сохранены');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const getImageUrl = (url: string | undefined) => {
    if (!url) return null;
    return getBannerImageUrl(url) || url;
  };

  return (
    <div className="social-about-tab">
      {/* ===== Social Links Section ===== */}
      <div className="social-about-tab__section">
        <div className="social-about-tab__section-header">
          <div>
            <h3 className="social-about-tab__section-title">Соц. сети</h3>
            <p className="social-about-tab__section-desc">Кнопки ссылок на ваши соцсети на странице магазина</p>
          </div>
          <Toggle checked={socialEnabled} onChange={setSocialEnabled} />
        </div>

        {socialEnabled && (
          <div className="social-about-tab__fields">
            {SOCIAL_PLATFORMS.map(({ key, label, icon: Icon, placeholder, hint }) => (
              <FormField key={key} label={label} hint={hint}>
                <div className="social-about-tab__input-row">
                  <span className="social-about-tab__input-icon"><Icon size={18} /></span>
                  <input
                    type="url"
                    className="social-about-tab__input"
                    placeholder={placeholder}
                    value={socialLinks[key] || ''}
                    onChange={e => updateSocialLink(key, e.target.value)}
                  />
                </div>
              </FormField>
            ))}
          </div>
        )}
      </div>

      {/* ===== About Us Section ===== */}
      <div className="social-about-tab__section">
        <div className="social-about-tab__section-header">
          <div>
            <h3 className="social-about-tab__section-title">О нас</h3>
            <p className="social-about-tab__section-desc">Страница «О нас» — расскажите о вашем магазине</p>
          </div>
          <Toggle checked={aboutEnabled} onChange={setAboutEnabled} />
        </div>

        {aboutEnabled && (
          <div className="social-about-tab__about-editor">
            {/* Background picker */}
            <div className="social-about-tab__bg-picker">
              <span className="social-about-tab__bg-label">Фон страницы</span>
              <div className="social-about-tab__bg-options">
                <button
                  className={`social-about-tab__bg-btn ${background.type === 'color' ? 'active' : ''}`}
                  onClick={() => setBackground(prev => ({ ...prev, type: 'color', url: undefined }))}
                >
                  Цвет
                </button>
                <button
                  className={`social-about-tab__bg-btn ${background.type === 'image' ? 'active' : ''}`}
                  onClick={() => {
                    if (background.type !== 'image') setBackground({ type: 'image', url: background.url });
                  }}
                >
                  Картинка
                </button>
              </div>
              {background.type === 'color' && (
                <div className="social-about-tab__color-row">
                  <input
                    type="color"
                    value={background.value || '#ffffff'}
                    onChange={e => setBackground({ type: 'color', value: e.target.value })}
                    className="social-about-tab__color-input"
                  />
                  <span className="social-about-tab__color-value">{background.value || '#ffffff'}</span>
                </div>
              )}
              {background.type === 'image' && (
                <div className="social-about-tab__bg-upload">
                  {background.url ? (
                    <div className="social-about-tab__bg-preview">
                      <img src={getImageUrl(background.url) || ''} alt="Фон" />
                      <button className="social-about-tab__bg-remove" onClick={() => setBackground({ type: 'image', url: undefined })}>
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      className="social-about-tab__bg-upload-btn"
                      onClick={() => bgFileInputRef.current?.click()}
                      disabled={uploadingBg}
                    >
                      {uploadingBg ? 'Загрузка...' : 'Загрузить фон'}
                    </button>
                  )}
                  <input
                    ref={bgFileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) {
                        setCropTarget('bg');
                        setCropAspect(16 / 9);
                        setCropSrc(URL.createObjectURL(f));
                      }
                      e.target.value = '';
                    }}
                  />
                </div>
              )}
            </div>

            {/* Block list */}
            <div className="social-about-tab__blocks">
              {blocks.map((block, i) => (
                <div key={i} className="social-about-tab__block">
                  <div className="social-about-tab__block-header">
                    <span className="social-about-tab__block-type">
                      {block.type === 'text' && <><Type size={14} /> Текст</>}
                      {block.type === 'image' && <><Image size={14} /> Фото</>}
                      {block.type === 'video' && <><Video size={14} /> Видео</>}
                    </span>
                    <div className="social-about-tab__block-actions">
                      <button onClick={() => moveBlock(i, -1)} disabled={i === 0} title="Вверх"><ChevronUp size={16} /></button>
                      <button onClick={() => moveBlock(i, 1)} disabled={i === blocks.length - 1} title="Вниз"><ChevronDown size={16} /></button>
                      <button onClick={() => removeBlock(i)} title="Удалить" className="social-about-tab__block-delete"><Trash2 size={16} /></button>
                    </div>
                  </div>

                  {block.type === 'text' && (
                    <div className="social-about-tab__block-body">
                      <textarea
                        className="social-about-tab__textarea"
                        rows={4}
                        placeholder="Введите текст..."
                        value={block.content || ''}
                        onChange={e => updateBlock(i, { content: e.target.value })}
                      />
                      <div className="social-about-tab__align-row">
                        <span className="social-about-tab__align-label">Выравнивание:</span>
                        {(['left', 'center', 'right'] as const).map(a => (
                          <button
                            key={a}
                            className={`social-about-tab__align-btn ${block.align === a ? 'active' : ''}`}
                            onClick={() => updateBlock(i, { align: a })}
                          >
                            {a === 'left' ? 'Лево' : a === 'center' ? 'Центр' : 'Право'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {block.type === 'image' && (
                    <div className="social-about-tab__block-body">
                      {block.url ? (
                        <div className="social-about-tab__image-preview">
                          <img src={getImageUrl(block.url) || ''} alt="" />
                          <button className="social-about-tab__image-remove" onClick={() => updateBlock(i, { url: '' })}>
                            <X size={14} /> Удалить
                          </button>
                        </div>
                      ) : (
                        <button
                          className="social-about-tab__upload-btn"
                          onClick={() => {
                            setPendingBlockIndex(i);
                            fileInputRef.current?.click();
                          }}
                          disabled={uploading === i}
                        >
                          {uploading === i ? 'Загрузка...' : 'Загрузить фото'}
                        </button>
                      )}
                      <input
                        type="text"
                        className="social-about-tab__input"
                        placeholder="Подпись (необязательно)"
                        value={block.caption || ''}
                        onChange={e => updateBlock(i, { caption: e.target.value })}
                      />
                    </div>
                  )}

                  {block.type === 'video' && (
                    <div className="social-about-tab__block-body">
                      <input
                        type="url"
                        className="social-about-tab__input"
                        placeholder="Ссылка на YouTube или VK Video"
                        value={block.url || ''}
                        onChange={e => updateBlock(i, { url: e.target.value })}
                      />
                      <input
                        type="text"
                        className="social-about-tab__input"
                        placeholder="Подпись (необязательно)"
                        value={block.caption || ''}
                        onChange={e => updateBlock(i, { caption: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Hidden file input for image blocks */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) {
                  setCropTarget('block');
                  setCropAspect(1);
                  setCropSrc(URL.createObjectURL(f));
                }
                e.target.value = '';
              }}
            />

            {/* Add block buttons */}
            <div className="social-about-tab__add-btns">
              <button className="social-about-tab__add-btn" onClick={() => addBlock('text')}>
                <Plus size={16} /> Текст
              </button>
              <button className="social-about-tab__add-btn" onClick={() => addBlock('image')}>
                <Plus size={16} /> Фото
              </button>
              <button className="social-about-tab__add-btn" onClick={() => addBlock('video')}>
                <Plus size={16} /> Видео
              </button>
            </div>

            {/* Preview button */}
            {blocks.length > 0 && (
              <button className="social-about-tab__preview-btn" onClick={() => setPreview(true)}>
                <Eye size={16} /> Предпросмотр
              </button>
            )}
          </div>
        )}
      </div>

      {/* Save button */}
      <button className="social-about-tab__save" onClick={handleSave} disabled={saving}>
        {saving ? 'Сохранение...' : 'Сохранить'}
      </button>

      {/* Crop modal */}
      {cropSrc && (
        <ImageCropModal
          isOpen={!!cropSrc}
          imageSrc={cropSrc}
          aspect={cropAspect}
          onCropComplete={handleCropComplete}
          onClose={() => { setCropSrc(null); setPendingBlockIndex(null); }}
          extraControls={
            <div className="social-about-tab__aspect-row">
              {ASPECT_OPTIONS.map(opt => (
                <button
                  key={opt.label}
                  type="button"
                  className={`social-about-tab__aspect-btn ${cropAspect === opt.value ? 'active' : ''}`}
                  onClick={() => setCropAspect(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          }
        />
      )}

      {/* Preview modal */}
      {preview && (
        <div className="social-about-tab__preview-overlay" onClick={() => setPreview(false)}>
          <div className="social-about-tab__preview-container" onClick={e => e.stopPropagation()}>
            <div className="social-about-tab__preview-header">
              <span>Предпросмотр «О нас»</span>
              <div className="social-about-tab__preview-header-actions">
                <button
                  className="social-about-tab__preview-theme-toggle"
                  onClick={() => setPreviewTheme(t => t === 'light' ? 'dark' : 'light')}
                  title={previewTheme === 'light' ? 'Тёмная тема' : 'Светлая тема'}
                >
                  {previewTheme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
                </button>
                <button onClick={() => setPreview(false)}><X size={20} /></button>
              </div>
            </div>
            <div
              className={`social-about-tab__preview-frame${background.type === 'image' && background.url ? ' social-about-tab__preview-frame--image-bg' : ''}`}
              style={(() => {
                const s: Record<string, string> = {};
                // Base theme
                if (previewTheme === 'light') {
                  s.backgroundColor = '#ffffff';
                  s['--text'] = '#000000';
                  s['--text-muted'] = '#666666';
                } else {
                  s.backgroundColor = '#1a1a1a';
                  s['--text'] = '#ffffff';
                  s['--text-muted'] = '#999999';
                }
                // Override with custom background
                if (background.type === 'color' && background.value) {
                  s.backgroundColor = background.value;
                  const colors = getContrastColors(background.value);
                  s['--text'] = colors.text;
                  s['--text-muted'] = colors.textSecondary;
                } else if (background.type === 'image' && background.url) {
                  s.backgroundImage = `url(${getImageUrl(background.url) || ''})`;
                  s.backgroundSize = 'cover';
                  s.backgroundPosition = 'center';
                  s['--text'] = '#ffffff';
                  s['--text-muted'] = '#dddddd';
                }
                return s as React.CSSProperties;
              })()}
            >
              {blocks.map((block, i) => {
                if (block.type === 'text' && block.content) {
                  return (
                    <div key={i} className="social-about-tab__preview-text" style={{ textAlign: (block.align as 'left' | 'center' | 'right') || 'left' }}>
                      {block.content.split('\n').map((line, j) => <p key={j}>{line}</p>)}
                    </div>
                  );
                }
                if (block.type === 'image' && block.url) {
                  return (
                    <div key={i} className="social-about-tab__preview-image">
                      <img src={getImageUrl(block.url) || ''} alt={block.caption || ''} />
                      {block.caption && <p className="social-about-tab__preview-caption">{block.caption}</p>}
                    </div>
                  );
                }
                if (block.type === 'video' && block.url) {
                  const embedUrl = getVideoEmbedUrl(block.url);
                  if (!embedUrl) return <p key={i} className="social-about-tab__preview-caption">Неверная ссылка на видео</p>;
                  return (
                    <div key={i} className="social-about-tab__preview-video">
                      <div className="social-about-tab__preview-video-wrap">
                        <iframe src={embedUrl} title={block.caption || 'Video'} allowFullScreen />
                      </div>
                      {block.caption && <p className="social-about-tab__preview-caption">{block.caption}</p>}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getVideoEmbedUrl(url: string): string | null {
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
  const vkMatch = url.match(/vk\.com\/video(-?\d+)_(\d+)/);
  if (vkMatch) return `https://vk.com/video_ext.php?oid=${vkMatch[1]}&id=${vkMatch[2]}`;
  return null;
}
