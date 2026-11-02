import { Alert, Button, Skeleton } from "antd";
export default function PageState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: Error | null;
  retry: () => void;
}) {
  if (loading) return <Skeleton active />;
  if (error)
    return (
      <Alert
        type="error"
        showIcon
        message={error.message}
        action={<Button onClick={retry}>重试</Button>}
      />
    );
  return null;
}
