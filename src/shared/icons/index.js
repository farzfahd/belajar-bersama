// Ikon kustom Belajar Bersama. Satu file per ikon, semua di-re-export dari sini
// supaya aplikasi cukup: import { IconEdit, IconTrash } from '.../shared/icons'.
//
// Aturan bersama (semua ikon mengikuti):
//   viewBox 0 0 24 24 | stroke 1.5 | stroke currentColor | fill none
//   (kecuali titik/penanda kecil yang boleh fill solid)
//   stroke-linecap/linejoin round | target render 16-20px
// Dibuat sendiri, bukan kloning library ikon apa pun.

import IconAchievements from './IconAchievements.jsx';
import IconArrowDown from './IconArrowDown.jsx';
import IconArrowUp from './IconArrowUp.jsx';
import IconBookmark from './IconBookmark.jsx';
import IconCheck from './IconCheck.jsx';
import IconClose from './IconClose.jsx';
import IconDashboard from './IconDashboard.jsx';
import IconDiscuss from './IconDiscuss.jsx';
import IconEdit from './IconEdit.jsx';
import IconEmptyNote from './IconEmptyNote.jsx';
import IconEmptyResource from './IconEmptyResource.jsx';
import IconExternalLink from './IconExternalLink.jsx';
import IconGreeting from './IconGreeting.jsx';
import IconLearn from './IconLearn.jsx';
import IconLock from './IconLock.jsx';
import IconMenu from './IconMenu.jsx';
import IconMove from './IconMove.jsx';
import IconNotifications from './IconNotifications.jsx';
import IconPlus from './IconPlus.jsx';
import IconProgress from './IconProgress.jsx';
import IconProjects from './IconProjects.jsx';
import IconQuiz from './IconQuiz.jsx';
import IconRestore from './IconRestore.jsx';
import IconRoadmap from './IconRoadmap.jsx';
import IconSearch from './IconSearch.jsx';
import IconSettings from './IconSettings.jsx';
import IconShare from './IconShare.jsx';
import IconTasks from './IconTasks.jsx';
import IconThemeDark from './IconThemeDark.jsx';
import IconThemeLight from './IconThemeLight.jsx';
import IconToday from './IconToday.jsx';
import IconTrash from './IconTrash.jsx';
import IconUser from './IconUser.jsx';
import IconUsers from './IconUsers.jsx';
import IconWarn from './IconWarn.jsx';

export {
  IconAchievements,
  IconArrowDown,
  IconArrowUp,
  IconBookmark,
  IconCheck,
  IconClose,
  IconDashboard,
  IconDiscuss,
  IconEdit,
  IconEmptyNote,
  IconEmptyResource,
  IconExternalLink,
  IconGreeting,
  IconLearn,
  IconLock,
  IconMenu,
  IconMove,
  IconNotifications,
  IconPlus,
  IconProgress,
  IconProjects,
  IconQuiz,
  IconRestore,
  IconRoadmap,
  IconSearch,
  IconSettings,
  IconShare,
  IconTasks,
  IconThemeDark,
  IconThemeLight,
  IconToday,
  IconTrash,
  IconUser,
  IconUsers,
  IconWarn
};

// Peta nama -> komponen ikon.
//
// navConfig.js sengaja TIDAK meng-import modul ini: file itu JS murni dan
// diuji dengan `node --test`, yang tidak bisa memuat `.jsx` maupun directory
// import. navConfig hanya menyimpan kunci string; Sidebar / BottomNav /
// Drawer yang merendernya lewat peta di bawah.
export const ICONS = {
  dashboard: IconDashboard,
  today: IconToday,
  learn: IconLearn,
  roadmap: IconRoadmap,
  quiz: IconQuiz,
  tasks: IconTasks,
  discuss: IconDiscuss,
  projects: IconProjects,
  progress: IconProgress,
  achievements: IconAchievements,
  notifications: IconNotifications,
  settings: IconSettings
};
