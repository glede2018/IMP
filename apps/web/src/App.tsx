import { ConfigProvider, App as AntApp } from "antd";
import zhCN from "antd/locale/zh_CN";
import { RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router } from "@/routes";
import { AuthProvider } from "@/contexts/AuthContext";
import { ApiError } from "@/services/api";
const client = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15000,
      retry: (count, error) =>
        !(error instanceof ApiError && error.status < 500) && count < 1,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});
export default function App() {
  return (
    <QueryClientProvider client={client}>
      <ConfigProvider
        locale={zhCN}
        theme={{
          token: {
            colorPrimary: '#ea580c',
            colorPrimaryHover: '#c2410c',
            colorPrimaryActive: '#9a3412',
            colorBgLayout: '#fff7ed',
            colorBgContainer: '#ffffff',
            colorBgElevated: '#ffffff',
            colorText: '#2c2924',
            colorTextSecondary: '#766e60',
            colorTextTertiary: '#968c7a',
            colorBorder: '#e9e5dd',
            colorBorderSecondary: '#f5f3ef',
            borderRadius: 8,
            borderRadiusLG: 12,
            fontSize: 14,
          },
        }}
      >
        <AntApp>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
