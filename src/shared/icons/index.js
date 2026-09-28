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
import IconArrowLeft from './IconArrowLeft.jsx';
import IconArrowRight from './IconArrowRight.jsx';
import IconArrowUp from './IconArrowUp.jsx';
import IconBlocks from './IconBlocks.jsx';
import IconBold from './IconBold.jsx';
import IconBook from './IconBook.jsx';
import IconBookmark from './IconBookmark.jsx';
import IconBooks from './IconBooks.jsx';
import IconCap from './IconCap.jsx';
import IconChart from './IconChart.jsx';
import IconCheck from './IconCheck.jsx';
import IconChevronDown from './IconChevronDown.jsx';
import IconChevronExpand from './IconChevronExpand.jsx';
import IconChevronRight from './IconChevronRight.jsx';
import IconChecklist from './IconChecklist.jsx';
import IconClock from './IconClock.jsx';
import IconClose from './IconClose.jsx';
import IconCode from './IconCode.jsx';
import IconCopy from './IconCopy.jsx';
import IconDashboard from './IconDashboard.jsx';
import IconDiscuss from './IconDiscuss.jsx';
import IconDoc from './IconDoc.jsx';
import IconEdit from './IconEdit.jsx';
import IconEmptyNote from './IconEmptyNote.jsx';
import IconEmptyResource from './IconEmptyResource.jsx';
import IconExternalLink from './IconExternalLink.jsx';
import IconEye from './IconEye.jsx';
import IconFilm from './IconFilm.jsx';
import IconFilter from './IconFilter.jsx';
import IconFlag from './IconFlag.jsx';
import IconFolder from './IconFolder.jsx';
import IconGlobe from './IconGlobe.jsx';
import IconGreeting from './IconGreeting.jsx';
import IconHeading from './IconHeading.jsx';
import IconImage from './IconImage.jsx';
import IconItalic from './IconItalic.jsx';
import IconKey from './IconKey.jsx';
import IconLearn from './IconLearn.jsx';
import IconLink from './IconLink.jsx';
import IconList from './IconList.jsx';
import IconLock from './IconLock.jsx';
import IconMail from './IconMail.jsx';
import IconMenu from './IconMenu.jsx';
import IconMind from './IconMind.jsx';
import IconMinus from './IconMinus.jsx';
import IconMove from './IconMove.jsx';
import IconNotes from './IconNotes.jsx';
import IconNotifications from './IconNotifications.jsx';
import IconPaperclip from './IconPaperclip.jsx';
import IconPlay from './IconPlay.jsx';
import IconPlus from './IconPlus.jsx';
import IconProgress from './IconProgress.jsx';
import IconProjects from './IconProjects.jsx';
import IconPuzzle from './IconPuzzle.jsx';
import IconQuestion from './IconQuestion.jsx';
import IconQuiz from './IconQuiz.jsx';
import IconQuote from './IconQuote.jsx';
import IconRestore from './IconRestore.jsx';
import IconRoadmap from './IconRoadmap.jsx';
import IconSearch from './IconSearch.jsx';
import IconSettings from './IconSettings.jsx';
import IconShare from './IconShare.jsx';
import IconSwap from './IconSwap.jsx';
import IconTable from './IconTable.jsx';
import IconTarget from './IconTarget.jsx';
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
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
  IconBlocks,
  IconBold,
  IconBook,
  IconBookmark,
  IconBooks,
  IconCap,
  IconChart,
  IconCheck,
  IconChevronDown,
  IconChevronExpand,
  IconChevronRight,
  IconChecklist,
  IconClock,
  IconClose,
  IconCode,
  IconCopy,
  IconDashboard,
  IconDiscuss,
  IconDoc,
  IconEdit,
  IconEmptyNote,
  IconEmptyResource,
  IconExternalLink,
  IconEye,
  IconFilm,
  IconFilter,
  IconFlag,
  IconFolder,
  IconGlobe,
  IconGreeting,
  IconHeading,
  IconImage,
  IconItalic,
  IconKey,
  IconLearn,
  IconLink,
  IconList,
  IconLock,
  IconMail,
  IconMenu,
  IconMind,
  IconMinus,
  IconMove,
  IconNotes,
  IconNotifications,
  IconPaperclip,
  IconPlay,
  IconPlus,
  IconProgress,
  IconProjects,
  IconPuzzle,
  IconQuestion,
  IconQuiz,
  IconQuote,
  IconRestore,
  IconRoadmap,
  IconSearch,
  IconSettings,
  IconShare,
  IconSwap,
  IconTable,
  IconTarget,
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
// diuji dengan "node --test", yang tidak bisa memuat .jsx maupun directory
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
