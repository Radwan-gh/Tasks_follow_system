repo: Radwan-gh/Tasks_follow_system
branch: main

## Last sync
date: 2026-08-18T00:00:00Z

### Updated in this project
- Added group 3 (3a/3b/3c) to the design file: notifications centre + bell, recurrence, attachments, comments, unified confirm sheet, admin password reset.
- Daily-use set: priority (new token #C05A17), in-board search & filter, board archiving, restricted move to «انتهى», owner summary, disabled-user states.
- Differentiators: cost, Hijri secondary date + optional due time, task templates, viewer role, PDF report export, and a 1280px desktop frame.
- v2-new-style.md gained section 7.3 mapping every group-3 screen to its endpoint.

### Updated previously
- Added the remaining screens and states (group 2a): login, account, users & permissions, new-user sheet, new-board sheet, board settings & members, older «انتهى» cards.
- Added empty, loading (skeletons), and error states — including the §6 partial-failure rollback after creating a task.
- Added a 1280px desktop view where the bottom bar becomes a sidebar.
- v2-new-style.md gained section 7.2 mapping every new screen to its repo file.

## Screen map
| Tasks Mobile Redesign.dc.html — 3a الإشعارات والتكرار والمرفقات والتعليقات | apps/web/src/features/boards/components/CardDetailModal.tsx, apps/web/src/features/auth/AccountPage.tsx, apps/web/src/features/admin/UsersAdminPage.tsx |
| Tasks Mobile Redesign.dc.html — 3b الأولوية والبحث والأرشفة والملخّص | apps/web/src/features/boards/BoardsListPage.tsx, apps/web/src/features/boards/components/ListColumn.tsx |
| Tasks Mobile Redesign.dc.html — 3c التكلفة والقوالب والمشاهد والتصدير | apps/web/src/features/boards/components/CardDetailModal.tsx, apps/web/src/lib/api-client.ts |
| Screen | Repo files |
|---|---|
| Tasks Mobile Redesign.dc.html — اللوحات | apps/web/src/features/boards/BoardsListPage.tsx, apps/web/src/App.tsx |
| Tasks Mobile Redesign.dc.html — اللوحة (Kanban) | apps/web/src/features/boards/components/ListColumn.tsx, apps/web/src/features/boards/components/CardItem.tsx |
| Tasks Mobile Redesign.dc.html — تفاصيل البطاقة | apps/web/src/features/boards/components/CardDetailModal.tsx |
| Tasks Mobile Redesign.dc.html — الإسناد | apps/web/src/features/boards/components/CardDetailModal.tsx (SubtaskRow, MemberChecklist), docs/10-subtasks-and-assignment.md |
| Tasks Mobile Redesign.dc.html — تسجيل الدخول | apps/web/src/features/auth/LoginPage.tsx, apps/web/src/features/auth/AuthContext.tsx |
| Tasks Mobile Redesign.dc.html — حسابي | apps/web/src/features/auth/AccountPage.tsx |
| Tasks Mobile Redesign.dc.html — المستخدمون والصلاحيات · ورقة مستخدم جديد | apps/web/src/features/admin/UsersAdminPage.tsx |
| Tasks Mobile Redesign.dc.html — ورقة لوحة جديدة | apps/web/src/features/boards/BoardsListPage.tsx |
| Tasks Mobile Redesign.dc.html — إعدادات اللوحة والأعضاء | apps/web/src/lib/api-client.ts (boards.addMember, boards.removeMember) |
| Tasks Mobile Redesign.dc.html — سطح المكتب | apps/web/src/App.tsx |

## Sync history
- 2026-08-09T05:17:31Z — read docs/01–11 + README; mobile redesign of boards list, board, card detail, assignment.
