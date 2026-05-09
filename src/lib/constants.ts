export const AV_COLORS = [
  ['#FCF0F5', '#C9477A'],
  ['#F0FDF4', '#16A34A'],
  ['#EFF6FF', '#2563EB'],
  ['#FFFBEB', '#D97706'],
  ['#F5F3FF', '#7C3AED']
];

export const STATUS_LBL: Record<string, string> = {
  'pending': 'Chờ thanh toán',
  'paid': 'Đã thanh toán',
  'cancelled': 'Đã huỷ',
  'scheduled': 'Đã lên lịch',
  'completed': 'Hoàn thành',
  'no-show': 'Không đến'
};

export const STATUS_CLS: Record<string, string> = {
  'pending': 'b-pending',
  'paid': 'b-paid',
  'cancelled': 'b-cancelled',
  'scheduled': 'b-scheduled',
  'completed': 'b-completed',
  'no-show': 'b-noshow'
};

export const CA_TYPES = {
  full:      { label:'Cả ngày',   startHour:8,  endHour:22, color:'#8B5CF6', bg:'#F5F3FF' },
  morning:   { label:'Ca sáng',   startHour:8,  endHour:13, color:'#D97706', bg:'#FFFBEB' },
  afternoon: { label:'Ca chiều',  startHour:13, endHour:18, color:'#2563EB', bg:'#EFF6FF' },
  evening:   { label:'Ca tối',    startHour:18, endHour:22, color:'#16A34A', bg:'#F0FDF4' },
};
