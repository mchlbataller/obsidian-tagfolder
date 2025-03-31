import { ItemView, Menu, Notice, Modal, TFile } from "obsidian";
import { mount } from "svelte";
import TagFolderPlugin from "./main";
import {
	OrderDirection,
	OrderKeyItem,
	OrderKeyTag,
	VIEW_TYPE_TAGFOLDER,
	VIEW_TYPE_TAGFOLDER_LINK,
	VIEW_TYPE_TAGFOLDER_LIST,
	type TagFolderSettings,
	type ViewItem,
} from "./types";
import { maxDepth, selectedTags } from "./store";
import {
	ancestorToLongestTag,
	ancestorToTags,
	isSpecialTag,
	renderSpecialTag,
	joinPartialPath,
	removeIntermediatePath,
	trimTrailingSlash,
} from "./util";
import { askString } from "dialog";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toggleObjectProp(
	obj: { [key: string]: any },
	propName: string,
	value: string | false
) {
	if (value === false) {
		const newTagInfoEntries = Object.entries(obj || {}).filter(
			([key]) => key != propName
		);
		if (newTagInfoEntries.length == 0) {
			return {};
		} else {
			return Object.fromEntries(newTagInfoEntries);
		}
	} else {
		return { ...(obj ?? {}), [propName]: value };
	}
}
export abstract class TagFolderViewBase extends ItemView {
	component!: ReturnType<typeof mount>;
	plugin!: TagFolderPlugin;
	navigation = false;
	async saveSettings(settings: TagFolderSettings) {
		this.plugin.settings = { ...this.plugin.settings, ...settings };
		await this.plugin.saveSettings();
		this.plugin.updateFileCaches();
	}
	showOrder(evt: MouseEvent) {
		const menu = new Menu();

		menu.addItem((item) => {
			item.setTitle("Tags")
				.setIcon("hashtag")
				.onClick((evt2) => {
					const menu2 = new Menu();
					for (const key in OrderKeyTag) {
						for (const direction in OrderDirection) {
							menu2.addItem((item) => {
								const newSetting = `${key}_${direction}`;
								item.setTitle(
									OrderKeyTag[key] +
										" " +
										OrderDirection[direction]
								).onClick(async () => {
									//@ts-ignore
									this.plugin.settings.sortTypeTag =
										newSetting;
									await this.plugin.saveSettings();
								});
								if (
									newSetting ==
									this.plugin.settings.sortTypeTag
								) {
									item.setIcon("checkmark");
								}
								return item;
							});
						}
					}
					menu2.showAtPosition({ x: evt.x, y: evt.y });
				});
			return item;
		});
		menu.addItem((item) => {
			item.setTitle("Items")
				.setIcon("document")
				.onClick((evt2) => {
					const menu2 = new Menu();
					for (const key in OrderKeyItem) {
						for (const direction in OrderDirection) {
							menu2.addItem((item) => {
								const newSetting = `${key}_${direction}`;
								item.setTitle(
									OrderKeyItem[key] +
										" " +
										OrderDirection[direction]
								).onClick(async () => {
									//@ts-ignore
									this.plugin.settings.sortType = newSetting;
									await this.plugin.saveSettings();
								});
								if (
									newSetting == this.plugin.settings.sortType
								) {
									item.setIcon("checkmark");
								}
								return item;
							});
						}
					}
					menu2.showAtPosition({ x: evt.x, y: evt.y });
				});
			return item;
		});
		menu.showAtMouseEvent(evt);
	}

	showLevelSelect(evt: MouseEvent) {
		const menu = new Menu();
		const setLevel = async (level: number) => {
			this.plugin.settings.expandLimit = level;
			await this.plugin.saveSettings();
			maxDepth.set(level);
		};
		for (const level of [2, 3, 4, 5]) {
			menu.addItem((item) => {
				item.setTitle(`Level ${level - 1}`).onClick(() => {
					void setLevel(level);
				});
				if (this.plugin.settings.expandLimit == level)
					item.setIcon("checkmark");
				return item;
			});
		}

		menu.addItem((item) => {
			item.setTitle("No limit")
				// .setIcon("hashtag")
				.onClick(() => {
					void setLevel(0);
				});
			if (this.plugin.settings.expandLimit == 0)
				item.setIcon("checkmark");

			return item;
		});
		menu.showAtMouseEvent(evt);
	}

	abstract getViewType(): string;

	showMenu(
		evt: MouseEvent,
		trail: string[],
		targetTag?: string,
		targetItems?: ViewItem[]
	) {
		const isTagTree = this.getViewType() == VIEW_TYPE_TAGFOLDER;
		const menu = new Menu();
		if (isTagTree) {
			const expandedTagsAll = ancestorToLongestTag(
				ancestorToTags(joinPartialPath(removeIntermediatePath(trail)))
			).map((e) => trimTrailingSlash(e));
			const expandedTags = expandedTagsAll
				.map((e) =>
					e
						.split("/")
						.filter((ee) => !isSpecialTag(ee))
						.join("/")
				)
				.filter((e) => e != "")
				.map((e) => "#" + e)
				.join(" ")
				.trim();
			const displayExpandedTags = expandedTagsAll
				.map((e) =>
					e
						.split("/")
						.filter((ee) => renderSpecialTag(ee))
						.join("/")
				)
				.filter((e) => e != "")
				.map((e) => "#" + e)
				.join(" ")
				.trim();

			if (navigator && navigator.clipboard) {
				menu.addItem((item) =>
					item
						.setTitle(`Copy tags:${expandedTags}`)
						.setIcon("hashtag")
						.onClick(async () => {
							await navigator.clipboard.writeText(expandedTags);
							new Notice("Copied");
						})
				);
			}
			menu.addItem((item) =>
				item
					.setTitle(
						`New note ${targetTag ? "in here" : "as like this"}`
					)
					.setIcon("create-new")
					.onClick(async () => {
						await this.plugin.createNewNote(trail);
					})
			);
			if (targetTag) {
				if (
					this.plugin.settings.useTagInfo &&
					this.plugin.tagInfo != null
				) {
					const tag = targetTag;

					if (
						tag in this.plugin.tagInfo &&
						"key" in this.plugin.tagInfo[tag]
					) {
						menu.addItem((item) =>
							item
								.setTitle(`Unpin`)
								.setIcon("pin")
								.onClick(async () => {
									this.plugin.tagInfo[tag] = toggleObjectProp(
										this.plugin.tagInfo[tag],
										"key",
										false
									);
									this.plugin.applyTagInfo();
									await this.plugin.saveTagInfo();
								})
						);
					} else {
						menu.addItem((item) => {
							item.setTitle(`Pin`)
								.setIcon("pin")
								.onClick(async () => {
									this.plugin.tagInfo[tag] = toggleObjectProp(
										this.plugin.tagInfo[tag],
										"key",
										""
									);
									this.plugin.applyTagInfo();
									await this.plugin.saveTagInfo();
								});
						});
					}
					menu.addItem((item) => {
						item.setTitle(`Set an alternative label`)
							.setIcon("pencil")
							.onClick(async () => {
								const oldAlt =
									tag in this.plugin.tagInfo
										? this.plugin.tagInfo[tag].alt ?? ""
										: "";
								const label = await askString(
									this.app,
									"",
									"",
									oldAlt
								);
								if (label === false) return;
								this.plugin.tagInfo[tag] = toggleObjectProp(
									this.plugin.tagInfo[tag],
									"alt",
									label == "" ? false : label
								);
								this.plugin.applyTagInfo();
								await this.plugin.saveTagInfo();
							});
					});

					// Add rename tag option
					menu.addItem((item) => {
						item.setTitle(`Rename tag`)
							.setIcon("text-cursor-input")
							.onClick(async () => {
								// Only rename exact tag match, not nested tags
								if (tag.includes("/")) {
									new Notice("Cannot rename nested tags. Please rename the leaf tag only.");
									return;
								}
								
								const newTagName = await askString(
									this.app,
									"Rename tag",
									"Enter new tag name:",
									tag
								);
								
								if (newTagName === false || newTagName === tag) return;
								
								// Check if new name is valid
								if (!newTagName || newTagName.includes(" ") || newTagName.includes("#")) {
									new Notice("Invalid tag name. Tag names cannot contain spaces or # symbols.");
									return;
								}
								
								// Confirm before proceeding with renaming
								const shouldRename = await this.plugin.confirmAction(
									`Are you sure you want to rename tag "${tag}" to "${newTagName}"?\n\nThis will modify all files containing this exact tag.`
								);
								
								if (shouldRename) {
									// Perform the tag renaming
									const result = await this.plugin.renameTag(tag, newTagName);
									if (result.success) {
										new Notice(`Renamed tag "${tag}" to "${newTagName}" in ${result.filesModified} files.`);
										
										// Update tag info if any
										if (tag in this.plugin.tagInfo) {
											this.plugin.tagInfo[newTagName] = {...this.plugin.tagInfo[tag]};
											delete this.plugin.tagInfo[tag];
											await this.plugin.saveTagInfo();
										}
										
										// Refresh the view
										this.plugin.refreshAllTree();
									} else {
										new Notice(`Failed to rename tag: ${result.error}`);
									}
								}
							});
					});

					menu.addItem((item) => {
						item.setTitle(`Change the mark`)
							.setIcon("pencil")
							.onClick(async () => {
								const oldMark =
									tag in this.plugin.tagInfo
										? this.plugin.tagInfo[tag].mark ?? ""
										: "";
								const mark = await askString(
									this.app,
									"",
									"",
									oldMark
								);
								if (mark === false) return;
								this.plugin.tagInfo[tag] = toggleObjectProp(
									this.plugin.tagInfo[tag],
									"mark",
									mark == "" ? false : mark
								);
								this.plugin.applyTagInfo();
								await this.plugin.saveTagInfo();
							});
					});
					menu.addItem((item) => {
						item.setTitle(`Redirect this tag to ...`)
							.setIcon("pencil")
							.onClick(async () => {
								const oldRedirect =
									tag in this.plugin.tagInfo
										? this.plugin.tagInfo[tag].redirect ??
										  ""
										: "";
								const redirect = await askString(
									this.app,
									"",
									"",
									oldRedirect
								);
								if (redirect === false) return;
								this.plugin.tagInfo[tag] = toggleObjectProp(
									this.plugin.tagInfo[tag],
									"redirect",
									redirect == "" ? false : redirect
								);
								this.plugin.applyTagInfo();
								await this.plugin.saveTagInfo();
							});
					});
					if (targetItems) {
						menu.addItem((item) => {
							item.setTitle(`Open scroll view`)
								.setIcon("sheets-in-box")
								.onClick(async () => {
									const files = targetItems.map(
										(e) => e.path
									);
									await this.plugin.openScrollView(
										undefined,
										displayExpandedTags,
										expandedTagsAll.join(", "),
										files
									);
								});
						});
						menu.addItem((item) => {
							item.setTitle(`Open list`)
								.setIcon("sheets-in-box")
								.onClick(() => {
									selectedTags.set(expandedTagsAll);
								});
						});
					}
				}
				// Add option to move files under a tag to a folder
				if (targetTag && targetItems && targetItems.length > 0) {
					menu.addItem((item) => {
						item.setTitle(`Move files to folder`)
							.setIcon("folder")
							.onClick(async () => {
								this.openMoveBatchFilesModal(
									targetItems,
									expandedTags
								);
							});
					});
				}
			}
		}
		if (!targetTag && targetItems && targetItems.length == 1) {
			const path = targetItems[0].path;
			const file = this.app.vault.getAbstractFileByPath(path);
			// Trigger
			this.app.workspace.trigger(
				"file-menu",
				menu,
				file,
				"file-explorer"
			);
			menu.addSeparator();
			menu.addItem((item) =>
				item
					.setTitle(`Open in new tab`)
					.setSection("open")
					.setIcon("lucide-file-plus")
					.onClick(async () => {
						await this.app.workspace.openLinkText(
							path,
							path,
							"tab"
						);
					})
			);
			menu.addItem((item) =>
				item
					.setTitle(`Open to the right`)
					.setSection("open")
					.setIcon("lucide-separator-vertical")
					.onClick(async () => {
						await this.app.workspace.openLinkText(
							path,
							path,
							"split"
						);
					})
			);

			// Add Delete Note option
			menu.addItem((item) => {
				item.setTitle("Delete note")
					.setSection("danger")
					.setIcon("trash")
					.onClick(() => {
						if (file instanceof TFile) {
							this.confirmDelete(file);
						}
					});
				item.dom.classList.add("tag-folder-delete-item");
				return item;
			});
		} else if (!isTagTree && targetTag) {
			const path = targetTag;
			const file = this.app.vault.getAbstractFileByPath(path);
			// Trigger
			this.app.workspace.trigger(
				"file-menu",
				menu,
				file,
				"file-explorer"
			);
			menu.addSeparator();
			menu.addItem((item) =>
				item
					.setTitle(`Open in new tab`)
					.setSection("open")
					.setIcon("lucide-file-plus")
					.onClick(async () => {
						await this.app.workspace.openLinkText(
							path,
							path,
							"tab"
						);
					})
			);
			menu.addItem((item) =>
				item
					.setTitle(`Open to the right`)
					.setSection("open")
					.setIcon("lucide-separator-vertical")
					.onClick(async () => {
						await this.app.workspace.openLinkText(
							path,
							path,
							"split"
						);
					})
			);
		}
		if ("screenX" in evt) {
			menu.showAtPosition({ x: evt.pageX, y: evt.pageY });
		} else {
			menu.showAtPosition({
				// @ts-ignore
				x: evt.nativeEvent.locationX,
				// @ts-ignore
				y: evt.nativeEvent.locationY,
			});
		}
		evt.preventDefault();
		// menu.showAtMouseEvent(evt);
	}

	// Add the confirmDelete method
	async confirmDelete(file: TFile) {
		const modal = new Modal(this.app);
		modal.titleEl.setText("Confirm Deletion");

		modal.contentEl.createEl("p", {
			text: `Are you sure you want to delete "${file.name}"?`,
		});

		const buttonContainer = modal.contentEl.createDiv(
			"modal-button-container"
		);

		buttonContainer
			.createEl("button", {
				text: "Cancel",
				cls: "mod-danger",
			})
			.addEventListener("click", () => {
				modal.close();
			});

		buttonContainer
			.createEl("button", {
				text: "Delete",
				cls: "mod-warning",
			})
			.addEventListener("click", async () => {
				try {
					await this.app.vault.trash(file, true);
					new Notice(`Deleted ${file.name}`);
				} catch (error) {
					new Notice(
						`Failed to delete ${file.name}: ${error.message}`
					);
				}
				modal.close();
			});

		modal.open();
	}

	// Add method to open the move batch files modal
	async openMoveBatchFilesModal(items: ViewItem[], tagName: string) {
		const modal = new FolderSuggestionModal(
			this.app,
			items,
			tagName,
			this.plugin
		);
		modal.open();
	}

	switchView() {
		let viewType = VIEW_TYPE_TAGFOLDER;
		const currentType = this.getViewType();
		if (currentType == VIEW_TYPE_TAGFOLDER) {
			viewType = VIEW_TYPE_TAGFOLDER_LIST;
		} else if (currentType == VIEW_TYPE_TAGFOLDER_LINK) {
			return;
		} else if (currentType == VIEW_TYPE_TAGFOLDER_LIST) {
			viewType = VIEW_TYPE_TAGFOLDER;
		}

		const leaves = this.app.workspace
			.getLeavesOfType(viewType)
			.filter((e) => !e.getViewState().pinned && e != this.leaf);
		if (leaves.length) {
			this.app.workspace.revealLeaf(leaves[0]);
		}
	}
}

// Add a folder suggestion modal for moving multiple files
class FolderSuggestionModal extends Modal {
	files: ViewItem[];
	tagName: string;
	plugin: TagFolderPlugin;
	folders: string[] = [];
	resultEl: HTMLElement;
	inputEl: HTMLInputElement;
	suggestionEls: HTMLDivElement[] = [];
	selectedIndex: number | null = null;

	constructor(
		app: App,
		files: ViewItem[],
		tagName: string,
		plugin: TagFolderPlugin
	) {
		super(app);
		this.files = files;
		this.tagName = tagName;
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h3", {
			text: `Move ${this.files.length} file${
				this.files.length === 1 ? "" : "s"
			} to folder`,
		});
		contentEl.createEl("p", {
			text: `This will move all files under tag "${this.tagName}" to the selected folder.`,
			cls: "move-files-description",
		});

		// Get all folders in the vault
		this.folders = this.getAllFolders();

		// Create an input for folder path
		const inputContainer = contentEl.createDiv("folder-input-container");
		inputContainer.createEl("label", { text: "Folder path:" });
		this.inputEl = inputContainer.createEl("input", {
			type: "text",
			placeholder: "Type to search for folders or create new one",
			// Remove the leading '#' from the tag name then replace the underscore with spaces
			value: this.tagName.replace(/^#/, "").replace(/_/g, " ")
		});

		// Create a results container
		const resultsContainer = contentEl.createDiv(
			"folder-results-container"
		);
		this.resultEl = resultsContainer.createEl("div", {
			cls: "folder-results",
		});

		// Add event listeners to input
		this.inputEl.addEventListener(
			"input",
			this.updateSuggestions.bind(this)
		);
		this.inputEl.addEventListener("keydown", this.handleKeydown.bind(this));

		// Create button container
		const buttonContainer = contentEl.createDiv("modal-button-container");

		// Cancel button
		buttonContainer
			.createEl("button", {
				text: "Cancel",
				cls: "mod-warning",
			})
			.addEventListener("click", () => {
				this.close();
			});

		// Move button
		buttonContainer
			.createEl("button", {
				text: "Move Files",
				cls: "mod-cta",
			})
			.addEventListener("click", () => {
				this.moveFiles();
			});

		// Show initial suggestions
		this.updateSuggestions();

		// Focus input
		setTimeout(() => this.inputEl.focus(), 0);
	}

	getAllFolders(): string[] {
		// Get all folders in the vault
		const folders: string[] = ["/"];
		// Get unique parent paths from all files
		const allFolderPaths = new Set<string>();

		this.app.vault.getAllLoadedFiles().forEach((file) => {
			if (file.parent && file.parent.path) {
				let path = file.parent.path;
				if (path !== "/") {
					allFolderPaths.add(path);

					// Add parent folders as well
					let parentPath = path.split("/");
					while (parentPath.length > 1) {
						parentPath.pop();
						allFolderPaths.add(parentPath.join("/"));
					}
				}
			}
		});

		return ["/", ...Array.from(allFolderPaths).sort()];
	}

	updateSuggestions() {
		const query = this.inputEl.value.toLowerCase();
		const filteredFolders = this.folders.filter((folder) =>
			folder.toLowerCase().includes(query)
		);

		this.resultEl.empty();
		this.suggestionEls = [];

		if (filteredFolders.length === 0) {
			this.resultEl.createEl("div", {
				text: "No matching folders. Enter path to create a new folder.",
				cls: "suggestion-empty",
			});
		}

		filteredFolders.forEach((folder, index) => {
			const suggestionEl = this.resultEl.createEl("div", {
				text: folder === "/" ? "/ (root)" : folder,
				cls: "suggestion-item",
			});

			if (index === this.selectedIndex) {
				suggestionEl.addClass("is-selected");
				this.inputEl.value = folder;
			}

			this.suggestionEls.push(suggestionEl);

			suggestionEl.addEventListener("click", () => {
				this.inputEl.value = folder;
				// this.moveFiles();
			});
		});

		// this.selectedIndex = Math.min(this.selectedIndex, filteredFolders.length - 1);
		if (
			this.selectedIndex &&
			this.selectedIndex >= 0 &&
			filteredFolders.length > 0
		) {
			this.suggestionEls[this.selectedIndex].addClass("is-selected");
		}
	}

	handleKeydown(event: KeyboardEvent) {
		if (event.key === "ArrowDown") {
			this.selectedIndex =
				this.selectedIndex === null
					? 0
					: (this.selectedIndex + 1) % this.suggestionEls.length;
			this.highlightSelected();
			event.preventDefault();
		} else if (event.key === "ArrowUp") {
			if (this.selectedIndex === null) {
				this.selectedIndex = this.suggestionEls.length - 1;
			}
			this.selectedIndex =
				(this.selectedIndex - 1 + this.suggestionEls.length) %
				this.suggestionEls.length;
			this.highlightSelected();
			event.preventDefault();
		} else if (event.key === "Enter") {
			this.moveFiles();
			event.preventDefault();
		} // set selectedIndex to null when typing
		else {
			this.selectedIndex = null;
			this.updateSuggestions();
		}
	}

	highlightSelected() {
		this.suggestionEls.forEach((el, i) => {
			if (i === this.selectedIndex) {
				el.addClass("is-selected");
				this.inputEl.value =
					el.textContent === "/ (root)" ? "/" : el.textContent || "";
				// scroll into view
				el.scrollIntoView({ block: "nearest" });
			} else {
				el.removeClass("is-selected");
			}
		});
	}

	async moveFiles() {
		const targetFolder = this.inputEl.value.trim();
		if (!targetFolder) return;

		// Normalize paths
		let normalizedPath = targetFolder === "/" ? "" : targetFolder;

		try {
			// Ensure target folder exists
			if (
				normalizedPath &&
				!this.app.vault.getAbstractFileByPath(normalizedPath)
			) {
				await this.app.vault.createFolder(normalizedPath);
			}

			// Track success and failures
			let successCount = 0;
			const failedFiles: string[] = [];

			// Show processing notice
			const statusNotice = new Notice(
				`Moving ${this.files.length} files...`,
				0
			);

			// Move each file
			for (const item of this.files) {
				try {
					const file = this.app.vault.getAbstractFileByPath(
						item.path
					);
					if (file instanceof TFile) {
						// Get filename
						const fileName = file.name;
						const newPath = normalizedPath
							? `${normalizedPath}/${fileName}`
							: fileName;

						// Skip if file would move to its current location
						if (newPath === file.path) continue;

						// Check if file with same name exists in target
						if (this.app.vault.getAbstractFileByPath(newPath)) {
							failedFiles.push(
								`${fileName} (already exists in target)`
							);
							continue;
						}

						// Move the file
						await this.app.fileManager.renameFile(file, newPath);
						successCount++;
					}
				} catch (error) {
					console.error(`Failed to move file ${item.path}:`, error);
					failedFiles.push(item.path);
				}
			}

			// Remove the processing notice
			statusNotice.hide();

			// Show results
			if (failedFiles.length === 0) {
				new Notice(
					`Successfully moved ${successCount} files to ${
						normalizedPath || "root"
					}`
				);
			} else {
				new Notice(
					`Moved ${successCount} files. ${failedFiles.length} files failed.`
				);
				console.log("Failed to move files:", failedFiles);
			}

			// Refresh the tag folder view
			this.plugin.refreshAllTree();
			this.close();
		} catch (error) {
			new Notice(`Error moving files: ${(error as any).message}`);
		}
	}
}
