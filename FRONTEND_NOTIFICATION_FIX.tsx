/**
 * ⚠️ FRONTEND NOTIFICATION FIX - REFERENCE GUIDE ⚠️
 * 
 * This is a REFERENCE FILE for your FRONTEND React component (not backend code).
 * This file provides code snippets to update your NotificationDashboard.tsx component.
 * 
 * ============================================================================
 * HOW TO USE THIS GUIDE:
 * ============================================================================
 * 
 * 1. Open your frontend NotificationDashboard.tsx component
 * 2. Copy the SendNotificationResult interface (lines 30-48) to your component
 * 3. Replace your handleSendNotification function with the updated version (lines 51-91)
 * 4. Replace your handleResendNotification function with the updated version (lines 94-129)
 * 5. Optionally add the detailed stats dialog (lines 132-258)
 * 
 * DO NOT import this file or try to compile it in your backend.
 * This is documentation showing the updated handler logic for your frontend.
 * ============================================================================
 */

// Type definitions for reference (your React component already has these from context)
type SetActionLoadingId = (id: string | null) => void;
type FetchNotifications = () => void;
type Toast = (options: any) => void;
type UseState = <T>(initial: T) => [T, (value: T) => void];

// Mock declarations to make TypeScript happy (remove when copying to your component)
declare const setActionLoadingId: SetActionLoadingId;
declare const fetchNotifications: FetchNotifications;
declare const toast: Toast;
declare const useState: UseState;
declare const api: {
  sendPushNotification: (id: string) => Promise<SendNotificationResult>;
  resendPushNotification: (id: string) => Promise<SendNotificationResult>;
};

// Add this interface at the top with your other interfaces
interface SendNotificationResult {
  success: boolean;
  notificationId: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  usersWithoutTokens: number;
  usersWithTokens: number;
  message: string;
  details: {
    targetedUsers: number;
    usersWithTokens: number;
    usersWithoutTokens: number;
    successfulSends: number;
    failedSends: number;
    deliveryRate: string;
  };
}

// REPLACE your handleSendNotification function with this:
const handleSendNotification = async (id: string) => {
  setActionLoadingId(id);
  try {
    const result: SendNotificationResult = await api.sendPushNotification(id);
    
    // Check if anyone received the notification
    if (result.sentCount === 0 && result.usersWithoutTokens === result.totalRecipients) {
      // All users don't have the app installed
      toast({
        title: "⚠️ No Notifications Delivered",
        description: `All ${result.totalRecipients} targeted users don't have the app installed or have notifications disabled. No notifications were sent.`,
        variant: "destructive",
      });
    } else if (result.sentCount === 0 && result.usersWithoutTokens > 0) {
      // Some users don't have tokens but none were delivered
      toast({
        title: "⚠️ Delivery Failed",
        description: `0 out of ${result.totalRecipients} users received the notification. ${result.usersWithoutTokens} users don't have the app installed.`,
        variant: "destructive",
      });
    } else if (result.usersWithoutTokens > 0) {
      // Partial delivery
      toast({
        title: "⚠️ Partially Delivered",
        description: `Successfully sent to ${result.sentCount} out of ${result.totalRecipients} users. ${result.usersWithoutTokens} users don't have the app installed. Delivery rate: ${result.details.deliveryRate}`,
      });
    } else if (result.failedCount > 0) {
      // Some failures
      toast({
        title: "⚠️ Sent with Errors",
        description: `Sent to ${result.sentCount} users, but ${result.failedCount} deliveries failed. Delivery rate: ${result.details.deliveryRate}`,
      });
    } else {
      // Perfect delivery
      toast({
        title: "✅ Notification Sent Successfully",
        description: `Successfully delivered to all ${result.sentCount} users (100% delivery rate)!`,
      });
    }
    
    fetchNotifications();
  } catch (error: any) {
    toast({
      title: "Error",
      description: error.message || "Failed to send notification",
      variant: "destructive",
    });
  } finally {
    setActionLoadingId(null);
  }
};

// REPLACE your handleResendNotification function with this:
const handleResendNotification = async (id: string) => {
  setActionLoadingId(id);
  try {
    const result: SendNotificationResult = await api.resendPushNotification(id);
    
    // Same logic as send
    if (result.sentCount === 0 && result.usersWithoutTokens === result.totalRecipients) {
      toast({
        title: "⚠️ Resend Failed",
        description: `All ${result.totalRecipients} targeted users don't have the app installed. No notifications were delivered.`,
        variant: "destructive",
      });
    } else if (result.sentCount === 0) {
      toast({
        title: "⚠️ Resend Failed",
        description: `Failed to deliver to any users. ${result.usersWithoutTokens} users don't have the app.`,
        variant: "destructive",
      });
    } else if (result.usersWithoutTokens > 0) {
      toast({
        title: "⚠️ Resent with Limitations",
        description: `Delivered to ${result.sentCount}/${result.totalRecipients} users. ${result.usersWithoutTokens} users don't have the app. Delivery rate: ${result.details.deliveryRate}`,
      });
    } else {
      toast({
        title: "✅ Notification Resent",
        description: `Successfully delivered to ${result.sentCount} users (${result.details.deliveryRate} delivery rate)!`,
      });
    }
    
    fetchNotifications();
  } catch (error: any) {
    toast({
      title: "Error",
      description: error.message || "Failed to resend notification",
      variant: "destructive",
    });
  } finally {
    setActionLoadingId(null);
  }
};

// OPTIONAL: Add a detailed stats dialog after sending
const [sendResult, setSendResult] = useState<SendNotificationResult | null>(null);
const [showResultDialog, setShowResultDialog] = useState(false);

// Update handleSendNotification to show detailed results:
const handleSendNotificationWithDetails = async (id: string) => {
  setActionLoadingId(id);
  try {
    const result: SendNotificationResult = await api.sendPushNotification(id);
    setSendResult(result);
    setShowResultDialog(true);
    fetchNotifications();
  } catch (error: any) {
    toast({
      title: "Error",
      description: error.message || "Failed to send notification",
      variant: "destructive",
    });
  } finally {
    setActionLoadingId(null);
  }
};

// Add this dialog component after your View Details Dialog:
/*
<Dialog open={showResultDialog} onOpenChange={setShowResultDialog}>
  <DialogContent className="sm:max-w-[500px]">
    <DialogHeader>
      <DialogTitle>Notification Delivery Report</DialogTitle>
      <DialogDescription>
        Detailed breakdown of notification delivery
      </DialogDescription>
    </DialogHeader>
    {sendResult && (
      <div className="space-y-4">
        {sendResult.usersWithoutTokens > 0 && (
          <div className="p-3 bg-orange-50 border border-orange-200 rounded-md">
            <div className="flex items-center gap-2 text-orange-800">
              <AlertCircle className="h-4 w-4" />
              <p className="text-sm font-medium">
                {sendResult.usersWithoutTokens} user(s) don't have the app installed
              </p>
            </div>
            <p className="text-xs text-orange-700 mt-1">
              These users cannot receive push notifications until they install and configure the app.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Targeted Users</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{sendResult.details.targetedUsers}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Users with App</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-blue-600">
                {sendResult.details.usersWithTokens}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Successfully Sent</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600">
                {sendResult.details.successfulSends}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Delivery Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-purple-600">
                {sendResult.details.deliveryRate}
              </p>
            </CardContent>
          </Card>

          {sendResult.details.failedSends > 0 && (
            <Card className="col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-red-600">Failed Deliveries</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-red-600">
                  {sendResult.details.failedSends}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Failed due to invalid tokens or network issues
                </p>
              </CardContent>
            </Card>
          )}

          {sendResult.details.usersWithoutTokens > 0 && (
            <Card className="col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-orange-600">Users Without App</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-orange-600">
                  {sendResult.details.usersWithoutTokens}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  These users were not sent notifications (no app installed)
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="text-sm text-muted-foreground p-3 bg-muted rounded-md">
          <p className="font-medium mb-1">Summary:</p>
          <p>{sendResult.message}</p>
        </div>
      </div>
    )}
    <DialogFooter>
      <Button onClick={() => setShowResultDialog(false)}>
        Close
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
*/
