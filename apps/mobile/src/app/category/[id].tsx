import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { NO_CATEGORY, categoryColor, useBoardCategories } from "@/features/boards/board-categories";
import { MergedBoardScreen } from "@/features/boards/merged-board-screen";
import { api } from "@/lib/api";

/**
 * `/category/:id` — opened from a category's heading on the boards list: the
 * category's boards merged into one board, laid out like the board screen
 * (`MergedBoardScreen`). `none` opens «بلا تصنيف», every board with no category.
 */
export default function CategoryBoardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const boards = useQuery({ queryKey: ["boards"], queryFn: () => api.boards.list() });
  const categories = useBoardCategories();
  const isNone = id === NO_CATEGORY;
  const title = isNone
    ? "بلا تصنيف"
    : (categories.data?.find((c) => c.id === id)?.name ?? boards.data?.find((b) => b.category?.id === id)?.category?.name ?? "");

  return (
    <MergedBoardScreen
      title={title}
      tileColor={isNone ? null : categoryColor(id)}
      includeBoard={(board) => (isNone ? board.category === null : board.category?.id === id)}
    />
  );
}
