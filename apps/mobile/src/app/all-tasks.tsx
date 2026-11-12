import { MergedBoardScreen } from "@/features/boards/merged-board-screen";

/** `/all-tasks` — «الكل» on the boards list: every board the user is on, merged into one board. */
export default function AllTasksScreen() {
  return <MergedBoardScreen title="الكل" />;
}
