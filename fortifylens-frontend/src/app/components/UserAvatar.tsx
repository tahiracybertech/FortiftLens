import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

interface UserAvatarProps {
  size?: number;       // px, default 36
  editable?: boolean;  // show upload affordance on click, default false
  className?: string;
}

function getInitials(nameOrEmail: string | undefined | null): string {
  if (!nameOrEmail) return 'U';
  const trimmed = nameOrEmail.trim();
  if (!trimmed) return 'U';
  const parts = trimmed.split(' ').filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return trimmed.charAt(0).toUpperCase();
}

export function UserAvatar({ size = 36, editable = false, className = '' }: UserAvatarProps) {
  const { user, updateAvatar } = useAuth();
  const [uploading, setUploading] = useState(false);
  // Bumping this forces the <input> to remount after every selection, so the
  // browser always fires onChange again next time — even if the user picks
  // the exact same file twice in a row (which a stale <input> would ignore).
  const [inputKey, setInputKey] = useState(0);

  const initials = getInitials(user?.fullName || user?.email);
  const dimension = `${size}px`;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setInputKey(k => k + 1); // remount input immediately so it's ready for next time no matter what happens below

    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return;
    }

    setUploading(true);
    try {
      const result = await updateAvatar(file);
      if (result.success) {
        toast.success('Profile picture updated');
      } else {
        console.error('[UserAvatar] upload failed:', result.message);
        toast.error(result.message || 'Could not update profile picture');
      }
    } catch (err: any) {
      console.error('[UserAvatar] unexpected upload error:', err);
      toast.error('Could not update profile picture');
    } finally {
      setUploading(false); // always runs, so the picker never stays stuck disabled
    }
  };

  const content = user?.avatarUrl ? (
    <img
      src={user.avatarUrl}
      alt={user.fullName || 'User'}
      style={{ width: dimension, height: dimension }}
      className="rounded-lg object-cover"
    />
  ) : (
    <div
      style={{ width: dimension, height: dimension }}
      className="rounded-lg bg-gradient-to-br from-[#00D4FF] to-[#0A0E1A] flex items-center justify-center text-white font-semibold"
    >
      {initials}
    </div>
  );

  if (!editable) {
    return <div className={className}>{content}</div>;
  }

  // <label> + hidden <input type="file"> is the most reliable cross-browser
  // way to open the native file picker — no ref.click() timing/quirks, and
  // it keeps working after the very first use.
  return (
    <label
      className={`relative group block ${uploading ? 'opacity-60 pointer-events-none' : 'cursor-pointer'} ${className}`}
      title="Change profile picture"
      aria-label="Change profile picture"
    >
      {content}
      <div
        style={{ width: dimension, height: dimension }}
        className="absolute inset-0 rounded-lg bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[10px] text-white"
      >
        {uploading ? '...' : 'Edit'}
      </div>
      <input
        key={inputKey}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        disabled={uploading}
        className="hidden"
      />
    </label>
  );
}