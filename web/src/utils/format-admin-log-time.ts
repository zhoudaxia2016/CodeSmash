import { format, isSameYear, parseISO } from 'date-fns'

/** 列表中的创建时间：缩短 ISO 显示。 */
export function formatAdminLogTableTime(iso: string): string {
  try {
    const d = parseISO(iso)
    if (Number.isNaN(d.getTime())) {
      return iso.length > 16 ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : iso
    }
    const now = new Date()
    if (isSameYear(d, now)) {
      return format(d, 'M-d HH:mm')
    }
    return format(d, 'yy-MM-dd HH:mm')
  } catch {
    return iso.slice(0, 16)
  }
}
