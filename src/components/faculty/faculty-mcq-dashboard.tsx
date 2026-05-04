"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type Resolver, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Pagination,
	PaginationContent,
	PaginationItem,
	PaginationNext,
	PaginationPrevious,
} from "@/components/ui/pagination";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { professorMcq } from "@/lib/copy/professor";
import { mcqWriteBodySchema, type McqWriteBody } from "@/lib/faculty/mcq-api-schemas";
import type { McqDetail, McqSortField } from "@/lib/services/mcq-service";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 15;

const SORT_OPTIONS: { value: McqSortField; label: string }[] = [
	{ value: "updated_at_desc", label: "Updated (newest)" },
	{ value: "updated_at_asc", label: "Updated (oldest)" },
	{ value: "prompt_asc", label: "Question (A–Z)" },
	{ value: "prompt_desc", label: "Question (Z–A)" },
];

function isMcqSortField(v: string): v is McqSortField {
	return SORT_OPTIONS.some((o) => o.value === v);
}

type ListResponse = {
	items: {
		id: string;
		prompt: string;
		optionCount: number;
		updatedAt: string;
	}[];
	total: number;
	page: number;
	pageSize: number;
};

type PreviewStage = "attempt" | "result";

async function readErrorMessage(res: Response): Promise<string> {
	try {
		const data: unknown = await res.json();
		if (
			data &&
			typeof data === "object" &&
			"message" in data &&
			typeof (data as { message: unknown }).message === "string"
		) {
			return (data as { message: string }).message;
		}
	} catch {
		/* ignore */
	}
	return "Something went wrong";
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const t = setTimeout(() => setDebounced(value), delayMs);
		return () => clearTimeout(t);
	}, [value, delayMs]);
	return debounced;
}

function defaultFormValues(): McqWriteBody {
	return {
		prompt: "",
		options: [
			{ body: "", isCorrect: true },
			{ body: "", isCorrect: false },
		],
	};
}

function normalizeOptionsCorrect(
	opts: McqWriteBody["options"],
): McqWriteBody["options"] {
	if (opts.length === 0) return opts;
	if (opts.some((o) => o.isCorrect)) return opts;
	return opts.map((o, i) => ({ ...o, isCorrect: i === 0 }));
}

export function FacultyMcqDashboard() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	const page = Math.max(1, Number(searchParams.get("page") || "1"));
	const sortParam = searchParams.get("sort") || "";
	const sort: McqSortField = isMcqSortField(sortParam)
		? sortParam
		: "updated_at_desc";
	const qInUrl = searchParams.get("q") ?? "";

	const [qDraft, setQDraft] = useState(qInUrl);
	useEffect(() => {
		setQDraft(qInUrl);
	}, [qInUrl]);

	const debouncedQ = useDebouncedValue(qDraft.trim(), 400);

	const replaceQuery = useCallback(
		(next: { page?: number; sort?: McqSortField; q?: string }) => {
			const p = new URLSearchParams(searchParams.toString());
			const pageVal = next.page ?? page;
			p.set("page", String(pageVal));
			const sortVal = next.sort ?? sort;
			p.set("sort", sortVal);
			const qVal = next.q !== undefined ? next.q : qInUrl;
			if (qVal.trim()) p.set("q", qVal.trim());
			else p.delete("q");
			router.replace(`${pathname}?${p.toString()}`);
		},
		[searchParams, router, pathname, page, sort, qInUrl],
	);

	useEffect(() => {
		const trimmed = debouncedQ.trim();
		const urlTrimmed = qInUrl.trim();
		if (trimmed === urlTrimmed) return;
		replaceQuery({ q: trimmed, page: 1 });
	}, [debouncedQ, qInUrl, replaceQuery]);

	const [list, setList] = useState<ListResponse | null>(null);
	const [listLoading, setListLoading] = useState(true);
	const [listError, setListError] = useState(false);

	const loadList = useCallback(async () => {
		setListLoading(true);
		setListError(false);
		const params = new URLSearchParams({
			page: String(page),
			pageSize: String(PAGE_SIZE),
			sort,
		});
		if (qInUrl.trim()) params.set("q", qInUrl.trim());
		try {
			const res = await fetch(`/api/faculty/mcqs?${params.toString()}`, {
				credentials: "include",
			});
			if (res.status === 401) {
				toast.error(professorMcq.unauthorized);
				router.replace("/login?returnUrl=%2Ffaculty");
				return;
			}
			if (!res.ok) {
				setListError(true);
				toast.error(await readErrorMessage(res));
				return;
			}
			const data = (await res.json()) as ListResponse;
			setList(data);
		} catch {
			setListError(true);
			toast.error(professorMcq.loadError);
		} finally {
			setListLoading(false);
		}
	}, [page, sort, qInUrl, router]);

	useEffect(() => {
		void loadList();
	}, [loadList]);

	const totalPages = useMemo(() => {
		if (!list) return 1;
		return Math.max(1, Math.ceil(list.total / list.pageSize));
	}, [list]);

	const form = useForm<McqWriteBody>({
		resolver: zodResolver(mcqWriteBodySchema) as Resolver<McqWriteBody>,
		defaultValues: defaultFormValues(),
	});

	const optionsRaw = useWatch({ control: form.control, name: "options" });
	const optionsList = useMemo(
		() => (Array.isArray(optionsRaw) ? optionsRaw : []),
		[optionsRaw],
	);
	const correctIndex = useMemo(() => {
		const i = optionsList.findIndex((o) => o?.isCorrect);
		return i >= 0 ? i : 0;
	}, [optionsList]);

	const [formOpen, setFormOpen] = useState(false);
	const [formMode, setFormMode] = useState<"create" | "edit">("create");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [formSubmitting, setFormSubmitting] = useState(false);

	const openCreate = () => {
		setFormMode("create");
		setEditingId(null);
		form.reset(defaultFormValues());
		setFormOpen(true);
	};

	const openEdit = async (id: string) => {
		setFormMode("edit");
		setEditingId(id);
		setFormOpen(true);
		form.reset(defaultFormValues());
		try {
			const res = await fetch(`/api/faculty/mcqs/${id}`, {
				credentials: "include",
			});
			if (!res.ok) {
				toast.error(await readErrorMessage(res));
				setFormOpen(false);
				return;
			}
			const data = (await res.json()) as { mcq: McqDetail };
			form.reset({
				prompt: data.mcq.prompt,
				options: data.mcq.options.map((o) => ({
					body: o.body,
					isCorrect: o.isCorrect,
				})),
			});
		} catch {
			toast.error(professorMcq.loadError);
			setFormOpen(false);
		}
	};

	const onSubmitForm = form.handleSubmit(async (values) => {
		setFormSubmitting(true);
		try {
			const url =
				formMode === "create"
					? "/api/faculty/mcqs"
					: `/api/faculty/mcqs/${editingId}`;
			const method = formMode === "create" ? "POST" : "PATCH";
			const res = await fetch(url, {
				method,
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify(values),
			});
			if (!res.ok) {
				toast.error(await readErrorMessage(res));
				return;
			}
			toast.success(
				formMode === "create"
					? professorMcq.saveCreateSuccess
					: professorMcq.saveUpdateSuccess,
			);
			setFormOpen(false);
			await loadList();
		} finally {
			setFormSubmitting(false);
		}
	});

	const [preview, setPreview] = useState<McqDetail | null>(null);
	const [previewStage, setPreviewStage] = useState<PreviewStage>("attempt");
	const [previewSelectedId, setPreviewSelectedId] = useState<string | null>(
		null,
	);

	const resetPreview = () => {
		setPreview(null);
		setPreviewStage("attempt");
		setPreviewSelectedId(null);
	};

	const openPreview = async (id: string) => {
		setPreviewStage("attempt");
		setPreviewSelectedId(null);
		try {
			const res = await fetch(`/api/faculty/mcqs/${id}`, {
				credentials: "include",
			});
			if (!res.ok) {
				toast.error(await readErrorMessage(res));
				return;
			}
			const data = (await res.json()) as { mcq: McqDetail };
			setPreview(data.mcq);
		} catch {
			toast.error(professorMcq.loadError);
		}
	};

	const previewWasCorrect = useMemo(() => {
		if (!preview || !previewSelectedId) return false;
		const picked = preview.options.find((o) => o.id === previewSelectedId);
		return !!picked?.isCorrect;
	}, [preview, previewSelectedId]);

	const [deleteId, setDeleteId] = useState<string | null>(null);
	const [deleteLoading, setDeleteLoading] = useState(false);

	const confirmDelete = async () => {
		if (!deleteId) return;
		setDeleteLoading(true);
		try {
			const res = await fetch(`/api/faculty/mcqs/${deleteId}`, {
				method: "DELETE",
				credentials: "include",
			});
			if (!res.ok) {
				toast.error(await readErrorMessage(res));
				return;
			}
			toast.success(professorMcq.deleteSuccess);
			setDeleteId(null);
			await loadList();
		} finally {
			setDeleteLoading(false);
		}
	};

	const setCorrectIndex = (idx: number) => {
		const opts = form.getValues("options");
		form.setValue(
			"options",
			opts.map((o, i) => ({ ...o, isCorrect: i === idx })),
		);
	};

	const addOption = () => {
		const opts = form.getValues("options");
		form.setValue("options", [...opts, { body: "", isCorrect: false }]);
	};

	const removeOptionAt = (index: number) => {
		const opts = form.getValues("options");
		if (opts.length <= 2) return;
		const next = opts.filter((_, i) => i !== index);
		form.setValue("options", normalizeOptionsCorrect(next));
	};

	const showEmpty =
		!listLoading &&
		!listError &&
		list &&
		list.total === 0 &&
		!qInUrl.trim();

	return (
		<main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6 md:p-8">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<h1 className="font-heading text-2xl font-semibold tracking-tight">MCQs</h1>
					<p className="text-sm text-muted-foreground">
						Create and manage multiple-choice questions for your classes.
					</p>
				</div>
				<Button type="button" onClick={openCreate}>
					<Plus className="size-4" />
					Add MCQ
				</Button>
			</div>

			<Card>
				<CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
					<div className="space-y-1">
						<CardTitle className="text-base">Your questions</CardTitle>
						<CardDescription>
							Search, sort, and curate. Each row is one multiple-choice item.
						</CardDescription>
					</div>
					<div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
						<div className="relative w-full sm:w-56">
							<Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								className="pl-9"
								placeholder="Search question text…"
								value={qDraft}
								onChange={(e) => setQDraft(e.target.value)}
								aria-label="Search MCQs by prompt"
							/>
						</div>
						<Select
							value={sort}
							onValueChange={(v) => {
								if (typeof v === "string" && isMcqSortField(v)) {
									replaceQuery({ sort: v, page: 1 });
								}
							}}
						>
							<SelectTrigger className="w-full sm:w-48">
								<SelectValue placeholder="Sort by" />
							</SelectTrigger>
							<SelectContent>
								{SORT_OPTIONS.map((o) => (
									<SelectItem key={o.value} value={o.value}>
										{o.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					{listLoading && (
						<div className="space-y-2">
							{Array.from({ length: 5 }).map((_, i) => (
								<Skeleton key={i} className="h-10 w-full" />
							))}
						</div>
					)}

					{listError && (
						<p className="text-sm text-muted-foreground">{professorMcq.loadError}</p>
					)}

					{showEmpty && (
						<Empty className="border border-dashed">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<Search className="size-4 opacity-60" />
								</EmptyMedia>
								<EmptyTitle>{professorMcq.emptyTitle}</EmptyTitle>
								<EmptyDescription>{professorMcq.emptyDescription}</EmptyDescription>
							</EmptyHeader>
							<EmptyContent>
								<Button type="button" onClick={openCreate}>
									<Plus className="size-4" />
									Add your first MCQ
								</Button>
							</EmptyContent>
						</Empty>
					)}

					{!listLoading && !listError && list && list.total > 0 && (
						<>
							<div className="overflow-x-auto rounded-lg border">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead className="w-10 text-center">#</TableHead>
											<TableHead>Question</TableHead>
											<TableHead className="w-24 text-right">Options</TableHead>
											<TableHead className="w-40">Updated</TableHead>
											<TableHead className="w-44 text-right">Actions</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{list.items.map((row, idx) => (
											<TableRow key={row.id}>
												<TableCell className="text-center text-muted-foreground text-sm">
													{(page - 1) * PAGE_SIZE + idx + 1}
												</TableCell>
												<TableCell className="max-w-[min(40vw,24rem)]">
													<span className="line-clamp-2 font-medium">{row.prompt}</span>
												</TableCell>
												<TableCell className="text-right tabular-nums">
													{row.optionCount}
												</TableCell>
												<TableCell className="text-muted-foreground text-sm whitespace-nowrap">
													{new Date(row.updatedAt).toLocaleString()}
												</TableCell>
												<TableCell className="text-right">
													<div className="flex justify-end gap-1">
														<Button
															type="button"
															variant="ghost"
															size="icon-sm"
															aria-label="Preview"
															onClick={() => void openPreview(row.id)}
														>
															<Eye className="size-4" />
														</Button>
														<Button
															type="button"
															variant="ghost"
															size="icon-sm"
															aria-label="Edit"
															onClick={() => void openEdit(row.id)}
														>
															<Pencil className="size-4" />
														</Button>
														<Button
															type="button"
															variant="ghost"
															size="icon-sm"
															className="text-destructive hover:text-destructive"
															aria-label="Delete"
															onClick={() => setDeleteId(row.id)}
														>
															<Trash2 className="size-4" />
														</Button>
													</div>
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>

							<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
								<p className="text-muted-foreground text-sm">
									Showing{" "}
									<span className="font-medium text-foreground">
										{list.total === 0
											? 0
											: (page - 1) * list.pageSize + 1}
										{" — "}
										{Math.min(page * list.pageSize, list.total)}
									</span>{" "}
									of <span className="font-medium text-foreground">{list.total}</span>
								</p>
								{totalPages > 1 && (
									<Pagination className="mx-0 w-full justify-end sm:w-auto">
										<PaginationContent>
											<PaginationItem>
												<PaginationPrevious
													href="#"
													className={page <= 1 ? "pointer-events-none opacity-40" : ""}
													onClick={(e) => {
														e.preventDefault();
														if (page > 1) replaceQuery({ page: page - 1 });
													}}
												/>
											</PaginationItem>
											<PaginationItem>
												<span className="flex h-8 items-center px-2 text-sm">
													Page {page} of {totalPages}
												</span>
											</PaginationItem>
											<PaginationItem>
												<PaginationNext
													href="#"
													className={
														page >= totalPages ? "pointer-events-none opacity-40" : ""
													}
													onClick={(e) => {
														e.preventDefault();
														if (page < totalPages) replaceQuery({ page: page + 1 });
													}}
												/>
											</PaginationItem>
										</PaginationContent>
									</Pagination>
								)}
							</div>
						</>
					)}

					{!listLoading && !listError && list && list.total === 0 && qInUrl.trim() && (
						<p className="text-muted-foreground text-sm text-center py-8">
							No matches for that search. Try different wording—or add a new question.
						</p>
					)}
				</CardContent>
			</Card>

			<Dialog open={formOpen} onOpenChange={setFormOpen}>
				<DialogContent
					className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
					showCloseButton
				>
					<DialogHeader>
						<DialogTitle>
							{formMode === "create" ? "Add MCQ" : "Edit MCQ"}
						</DialogTitle>
						<DialogDescription>
							Enter the stem and at least two answers. Mark exactly one as correct.
						</DialogDescription>
					</DialogHeader>
					<form onSubmit={onSubmitForm} className="grid gap-4">
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="mcq-prompt">Question</FieldLabel>
								<Textarea
									id="mcq-prompt"
									rows={4}
									{...form.register("prompt")}
									aria-invalid={!!form.formState.errors.prompt}
								/>
								<FieldError errors={[form.formState.errors.prompt]} />
							</Field>

							<div className="space-y-2">
								<FieldLabel>Answer choices</FieldLabel>
								<RadioGroup
									value={String(correctIndex)}
									onValueChange={(v) => setCorrectIndex(Number(v))}
									className="gap-3"
								>
									{optionsList.map((_, index) => (
										<div
											key={index}
											className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-start"
										>
											<div className="flex items-center gap-2 pt-1">
												<RadioGroupItem value={String(index)} id={`correct-${index}`} />
												<label
													htmlFor={`correct-${index}`}
													className="text-muted-foreground text-xs whitespace-nowrap"
												>
													Correct
												</label>
											</div>
											<div className="min-w-0 flex-1 space-y-1">
												<Input
													placeholder={`Option ${index + 1}`}
													{...form.register(`options.${index}.body` as const)}
													aria-invalid={!!form.formState.errors.options?.[index]?.body}
												/>
												<FieldError
													errors={[form.formState.errors.options?.[index]?.body]}
												/>
											</div>
											<Button
												type="button"
												variant="ghost"
												size="sm"
												className="text-destructive shrink-0"
												disabled={optionsList.length <= 2}
												onClick={() => removeOptionAt(index)}
											>
												Remove
											</Button>
										</div>
									))}
								</RadioGroup>
								<FieldError errors={[form.formState.errors.options]} />
							</div>

							<Button type="button" variant="outline" size="sm" onClick={addOption}>
								Add option
							</Button>
						</FieldGroup>

						<DialogFooter className="pt-2 sm:justify-end">
							<Button
								type="button"
								variant="outline"
								onClick={() => setFormOpen(false)}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={formSubmitting}>
								{formSubmitting ? "Saving…" : "Save"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			<Dialog open={!!preview} onOpenChange={(open) => !open && resetPreview()}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>{professorMcq.previewDialogTitle}</DialogTitle>
						<DialogDescription>
							{previewStage === "attempt"
								? professorMcq.previewAttemptDescription
								: professorMcq.previewResultDescription}
						</DialogDescription>
					</DialogHeader>
					{preview && (
						<div className="space-y-4 text-sm">
							<p className="font-medium leading-snug">{preview.prompt}</p>

							{previewStage === "attempt" ? (
								<>
									<RadioGroup
										className="gap-2"
										value={previewSelectedId ?? undefined}
										onValueChange={(v) => {
											if (typeof v === "string") setPreviewSelectedId(v);
										}}
									>
										{preview.options.map((o) => (
											<div
												key={o.id}
												className="flex items-start gap-3 rounded-lg border p-3"
											>
												<RadioGroupItem
													value={o.id}
													id={`preview-opt-${o.id}`}
													className="mt-0.5"
												/>
												<label
													htmlFor={`preview-opt-${o.id}`}
													className="flex-1 cursor-pointer leading-snug"
												>
													{o.body}
												</label>
											</div>
										))}
									</RadioGroup>
									<p className="text-muted-foreground text-xs">
										{professorMcq.previewPickFirstHint}
									</p>
									<DialogFooter className="gap-2 sm:justify-end">
										<Button
											type="button"
											disabled={!previewSelectedId}
											onClick={() => setPreviewStage("result")}
										>
											{professorMcq.previewSubmitAnswer}
										</Button>
									</DialogFooter>
								</>
							) : (
								<>
									<div
										className={cn(
											"rounded-lg border p-3",
											previewWasCorrect
												? "border-emerald-600/40 bg-emerald-500/10 dark:border-emerald-500/30"
												: "border-destructive/40 bg-destructive/5",
										)}
									>
										{previewWasCorrect ? (
											<>
												<p className="font-medium text-emerald-800 dark:text-emerald-300">
													{professorMcq.previewResultHeadlineCorrect}
												</p>
												<p className="text-muted-foreground mt-1 text-xs leading-relaxed">
													{professorMcq.previewResultBodyCorrect}
												</p>
											</>
										) : (
											<>
												<p className="font-medium text-destructive">
													{professorMcq.previewResultHeadlineIncorrect}
												</p>
												<p className="text-muted-foreground mt-1 text-xs leading-relaxed">
													{professorMcq.previewResultBodyIncorrect}
												</p>
											</>
										)}
									</div>
									<ul className="space-y-2">
										{preview.options.map((o) => {
											const isPick = o.id === previewSelectedId;
											const wrongPick = !previewWasCorrect && isPick;
											const rightPick = previewWasCorrect && isPick;
											const showKeyed =
												!previewWasCorrect && o.isCorrect && !isPick;
											return (
												<li
													key={o.id}
													className={cn(
														"flex flex-wrap items-center gap-2 rounded-md border px-3 py-2",
														wrongPick &&
															"border-destructive/60 bg-destructive/5",
														rightPick && "border-primary bg-primary/5",
														showKeyed && "ring-2 ring-primary/25",
													)}
												>
													<span className="min-w-0 flex-1">{o.body}</span>
													{rightPick && (
														<Badge variant="secondary">
															{professorMcq.previewBadgeYourCorrect}
														</Badge>
													)}
													{wrongPick && (
														<Badge variant="destructive">
															{professorMcq.previewBadgeYourIncorrect}
														</Badge>
													)}
													{showKeyed && (
														<Badge variant="secondary">
															{professorMcq.previewBadgeCorrectKey}
														</Badge>
													)}
												</li>
											);
										})}
									</ul>
									<DialogFooter className="sm:justify-start">
										<Button
											type="button"
											variant="outline"
											onClick={() => {
												setPreviewStage("attempt");
												setPreviewSelectedId(null);
											}}
										>
											{professorMcq.previewTryAgain}
										</Button>
									</DialogFooter>
								</>
							)}
						</div>
					)}
				</DialogContent>
			</Dialog>

			<AlertDialog open={!!deleteId} onOpenChange={(o) => !o && !deleteLoading && setDeleteId(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{professorMcq.deleteTitle}</AlertDialogTitle>
						<AlertDialogDescription>
							{professorMcq.deleteDescription}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={deleteLoading}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={(e) => {
								e.preventDefault();
								void confirmDelete();
							}}
							disabled={deleteLoading}
						>
							{deleteLoading ? "Removing…" : "Remove"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</main>
	);
}
