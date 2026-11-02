import { useEffect, useState } from 'react';
import { Modal, Checkbox, Button } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import {
  fetchDistributableAccounts,
  platformMap,
  platformColorMap,
  accountTagTypeMap,
} from '@/services/preview';
import type { DistributableAccount, Platform } from '@/types/preview';

interface DistributeModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (selectedIds: string[]) => void;
}

/**
 * 分发到矩阵账号弹窗
 * 按平台分组展示账号，支持全选/单选，确认后回调选中的账号 ID 列表
 */
export default function DistributeModal({ open, onCancel, onConfirm }: DistributeModalProps) {
  const [accounts, setAccounts] = useState<DistributableAccount[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      fetchDistributableAccounts().then((data) => setAccounts(data));
      setSelectedIds([]);
    }
  }, [open]);

  const platforms: Platform[] = ['douyin', 'kuaishou', 'xiaohongshu'];

  const accountsByPlatform = (platform: Platform) => accounts.filter((a) => a.platform === platform);

  const isPlatformAllSelected = (platform: Platform) => {
    const list = accountsByPlatform(platform);
    return list.length > 0 && list.every((a) => selectedIds.includes(a.id));
  };

  const toggleAccount = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const togglePlatformAll = (platform: Platform) => {
    const list = accountsByPlatform(platform);
    const allSelected = isPlatformAllSelected(platform);
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !list.some((a) => a.id === id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...list.map((a) => a.id)])));
    }
  };

  const handleConfirm = () => {
    onConfirm(selectedIds);
  };

  return (
    <Modal
      title="分发到矩阵账号"
      open={open}
      onCancel={onCancel}
      footer={null}
      width={680}
      destroyOnClose
    >
      <div className="space-y-6">
        {platforms.map((platform) => {
          const list = accountsByPlatform(platform);
          return (
            <section key={platform} className="space-y-3">
              <div className="flex items-center justify-between">
                <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--yp-neutral-900)' }}>{platformMap[platform]}</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--yp-neutral-500)', cursor: 'pointer' }}>
                  <Checkbox
                    checked={isPlatformAllSelected(platform)}
                    onChange={() => togglePlatformAll(platform)}
                  />
                  全选
                </label>
              </div>
              <div className="space-y-2">
                {list.map((a) => {
                  const tagInfo = accountTagTypeMap[a.tagType];
                  const checked = selectedIds.includes(a.id);
                  return (
                    <label
                      key={a.id}
                      className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                      style={{
                        border: `1px solid ${checked ? 'var(--yp-primary-300)' : 'var(--yp-border)'}`,
                        background: checked ? 'var(--yp-primary-50)' : 'var(--yp-card)',
                      }}
                    >
                      <Checkbox checked={checked} onChange={() => toggleAccount(a.id)} />
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: '50%',
                          background: `${platformColorMap[a.platform]}20`,
                          color: platformColorMap[a.platform],
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <UserOutlined />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--yp-neutral-900)' }}>{a.nickname}</div>
                        <div style={{ fontSize: 12, color: 'var(--yp-neutral-500)' }}>ID: {a.accountId}</div>
                      </div>
                      <span className={`yp-tag ${tagInfo.tagClass}`}>{tagInfo.label}</span>
                    </label>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-5 mt-6" style={{ borderTop: '1px solid var(--yp-border)' }}>
        <span style={{ fontSize: 14, color: 'var(--yp-neutral-500)' }}>已选择 {selectedIds.length} 个账号</span>
        <div className="flex gap-3">
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" onClick={handleConfirm} disabled={selectedIds.length === 0}>
            确认分发
          </Button>
        </div>
      </div>
    </Modal>
  );
}
