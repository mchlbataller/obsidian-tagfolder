import { Menu, type ViewStateResult, WorkspaceLeaf } from "obsidian";
import TagFolderViewComponent from "./TagFolderViewComponent.svelte";
import {
	type TagFolderListState,
	VIEW_TYPE_TAGFOLDER_LIST
} from "./types";
import TagFolderPlugin from "./main";
import { TagFolderViewBase } from "./TagFolderViewBase";
import { mount, unmount } from "svelte";
import { writable } from "svelte/store";

export class TagFolderList extends TagFolderViewBase {

	plugin: TagFolderPlugin;
	icon = "stacked-levels";
	title: string = "";

	onPaneMenu(menu: Menu, source: string): void {
		super.onPaneMenu(menu, source);
		menu.addItem(item => {
			item.setIcon("pin")
				.setTitle("Pin")
				.onClick(() => {
					this.leaf.togglePinned();
				})
		})
	}

	getIcon(): string {
		return "stacked-levels";
	}

	state: TagFolderListState = { tags: [], title: "" };

	async setState(state: TagFolderListState, result: ViewStateResult): Promise<void> {
		this.state = { ...this.state, ...state };
		this.title = state.tags.join(",");
		this.stateStore.set(this.state);
		result = {
			history: false
		};
		return await Promise.resolve();
	}
	stateStore = writable<TagFolderListState>(this.state);

	getState() {
		return this.state;
	}

	constructor(leaf: WorkspaceLeaf, plugin: TagFolderPlugin) {
		super(leaf);
		this.plugin = plugin;

		this.showMenu = this.showMenu.bind(this);
		this.showOrder = this.showOrder.bind(this);
		this.newNote = this.newNote.bind(this);
		this.showLevelSelect = this.showLevelSelect.bind(this);
		this.switchView = this.switchView.bind(this);
		this.refreshTree = this.refreshTree.bind(this); // Bind the new refresh method
	}

	async newNote(evt: MouseEvent) {
		await this.plugin.createNewNote(this.state.tags);
	}

	getViewType() {
		return VIEW_TYPE_TAGFOLDER_LIST;
	}

	getDisplayText() {
		return `Files with ${this.state.title}`;
	}

	async onOpen() {
		this.containerEl.empty();
		this.component = mount(TagFolderViewComponent, {
			target: this.containerEl,
			props: {
				openFile: this.plugin.focusFile,
				hoverPreview: this.plugin.hoverPreview,
				title: "",
				showMenu: this.showMenu,
				showLevelSelect: this.showLevelSelect,
				showOrder: this.showOrder,
				refreshTree: this.refreshTree, // Add this new property
				newNote: this.newNote,
				openScrollView: this.plugin.openScrollView,
				isViewSwitchable: this.plugin.settings.useMultiPaneList,
				switchView: this.switchView,
				saveSettings: this.saveSettings.bind(this),
				stateStore: this.stateStore,
			},
		});
		return await Promise.resolve();
	}

	async onClose() {
		if (this.component) {
			unmount(this.component);
			this.component = undefined!;
		}
		return await Promise.resolve();
	}

}
