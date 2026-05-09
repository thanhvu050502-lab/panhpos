import React, { useState } from 'react';
import { useAuth, Member } from '../../hooks/useAuth';
import { toast } from '../ui/Toast';
import { useConfirmAlert } from '../../hooks/useConfirmAlert';

interface AccountManagementPanelProps {
  onClose: () => void;
}

export const AccountManagementPanel: React.FC<AccountManagementPanelProps> = ({ onClose }) => {
  const { confirm } = useConfirmAlert();
  const { session, getMembers, addMember, removeMemberByUsername } = useAuth();
  const members = getMembers().filter(m => !m.isMaster);

  const [editingMaster, setEditingMaster] = useState(false);
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('staff');
  const [password, setPassword] = useState('');

  const resetForm = () => {
    setUsername('');
    setName('');
    setRole('staff');
    setPassword('');
    setEditingMaster(false);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      toast('Vui lòng nhập tên đăng nhập', 'error');
      return;
    }
    if (!editingMaster && !password.trim()) {
      toast('Vui lòng nhập mật khẩu', 'error');
      return;
    }
    try {
      await addMember(username, name, role, password);
      toast(editingMaster ? 'Đã cập nhật tài khoản' : 'Đã lưu tài khoản', 'success');
      resetForm();
    } catch {
      toast('Lưu tài khoản thất bại', 'error');
    }
  };

  const handleEdit = (m: Member) => {
    setUsername(m.username);
    setName(m.displayName || m.name);
    setRole(m.role);
    setPassword('');
    setEditingMaster(!!m.isMaster);
  };

  const handleRemove = async (m: Member) => {
    if (m.isMaster) {
      toast('Không thể xóa tài khoản hệ thống (Master)', 'error');
      return;
    }
    if (m.username.toLowerCase() === session?.username?.toLowerCase()) {
      toast('Không thể xóa tài khoản đang đăng nhập', 'error');
      return;
    }
    const ok = await confirm({
      title: 'Xóa tài khoản',
      message: `Bạn có chắc muốn xóa tài khoản ${m.username}?`,
      confirmLabel: 'Xóa',
      confirmVariant: 'danger'
    });
    if (ok) {
      removeMemberByUsername(m.username);
      toast('Đã xóa tài khoản', 'success');
      if (username === m.username) resetForm();
    }
  };

  return (
    <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
      <div className="card" style={{ padding: '16px', marginBottom: '16px' }}>
        <form onSubmit={handleAdd}>
          <div className="fg">
            <label className="flbl">Tên đăng nhập <span className="req">*</span></label>
            <input 
              className="fc" 
              type="text" 
              value={username} 
              onChange={e => setUsername(e.target.value)} 
              placeholder="Nhập tên đăng nhập" 
              disabled={editingMaster}
              style={editingMaster ? { backgroundColor: 'var(--bg3)', color: 'var(--ink4)' } : {}}
            />
            {editingMaster && <div className="ssub" style={{ color: 'var(--amber)' }}>Không thể đổi tên đăng nhập tài khoản Master</div>}
          </div>
          <div className="fg">
            <label className="flbl">Mật khẩu {editingMaster ? '(Để trống nếu không đổi)' : <span className="req">*</span>}</label>
            <input 
              className="fc" 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              placeholder={editingMaster ? "Nhập mật khẩu mới (tùy chọn)" : "Nhập mật khẩu"} 
            />
          </div>
          <div className="fg">
            <label className="flbl">Tên hiển thị</label>
            <input 
              className="fc" 
              type="text" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              placeholder="Nhập tên hiển thị" 
            />
          </div>
          <div className="fg">
            <label className="flbl">Vai trò</label>
            <select 
              className="fc" 
              value={role} 
              onChange={e => setRole(e.target.value)}
              disabled={editingMaster}
              style={editingMaster ? { backgroundColor: 'var(--bg3)', color: 'var(--ink4)' } : {}}
            >
              <option value="staff">Nhân viên (Staff)</option>
              <option value="owner">Chủ tiệm (Owner/Admin)</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <button type="submit" className="btn brand full">
              {username ? 'Lưu cập nhật' : 'Thêm tài khoản'}
            </button>
            {username && (
              <button type="button" className="btn outline" onClick={resetForm}>
                Hủy
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="shd">
        <h3>Danh sách tài khoản ({members.length})</h3>
      </div>

      <div className="card">
        {members.map(m => (
          <div className="lrow" key={m.username}>
            <div className="av" style={{ width: 36, height: 36, background: 'var(--brand-l)', color: 'var(--brand)' }}>
              {(m.displayName || m.name || m.username).charAt(0).toUpperCase()}
            </div>
            <div className="lrow-info">
              <div className="lrow-ttl">
                {m.displayName || m.name} 
                {m.isMaster && <span style={{ marginLeft: 6, fontSize: 10, background: 'var(--amber)', color: '#fff', padding: '2px 6px', borderRadius: 4 }}>MASTER</span>}
              </div>
              <div className="lrow-sub">{m.username} • {m.role === 'owner' ? 'Chủ tiệm' : 'Nhân viên'}</div>
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button 
                className="btn ghost icon" 
                style={{ color: 'var(--blue)' }} 
                onClick={() => handleEdit(m)}
              >
                ✏️
              </button>
              {(!m.isMaster && m.username.toLowerCase() !== session?.username?.toLowerCase()) && (
                <button 
                  className="btn ghost icon" 
                  style={{ color: 'var(--red)' }} 
                  onClick={() => handleRemove(m)}
                >
                  🗑
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
