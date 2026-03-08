import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { cn } from '@/lib/utils';

interface ChildAvatarProps {
  fotoUrl?: string | null;
  nome: string;
  className?: string;
  fallbackClassName?: string;
}

/**
 * Avatar component that automatically resolves child photos.
 * Handles both HTTP URLs (legacy/public) and path-only strings (private bucket).
 */
const ChildAvatar = ({ fotoUrl, nome, className, fallbackClassName }: ChildAvatarProps) => {
  const resolvedUrl = useSignedUrl(fotoUrl, 'child-photos');

  return (
    <Avatar className={className}>
      {resolvedUrl && <AvatarImage src={resolvedUrl} alt={nome} />}
      <AvatarFallback className={fallbackClassName}>
        {nome?.charAt(0) || '?'}
      </AvatarFallback>
    </Avatar>
  );
};

export default ChildAvatar;
