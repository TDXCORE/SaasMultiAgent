import { Skeleton } from '@kit/ui/skeleton';
import { Card, CardContent, CardHeader } from '@kit/ui/card';

export default function WhatsAppSettingsLoading() {
  return (
    <div className="space-y-6">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-6 w-24" />
        </div>
      </div>
      
      <Card>
        <CardHeader className="text-center space-y-2">
          <Skeleton className="h-6 w-48 mx-auto" />
          <Skeleton className="h-4 w-72 mx-auto" />
        </CardHeader>
        
        <CardContent className="text-center space-y-4">
          <Skeleton className="h-4 w-56 mx-auto" />
          <Skeleton className="h-10 w-48 mx-auto" />
        </CardContent>
      </Card>
    </div>
  );
}