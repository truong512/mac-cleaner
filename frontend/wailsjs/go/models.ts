export namespace model {
	
	export class AppSettings {
	    dryRunDefault: boolean;
	    excludeGlobs: string[];
	    bigFilesMinBytes: number;
	
	    static createFrom(source: any = {}) {
	        return new AppSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.dryRunDefault = source["dryRunDefault"];
	        this.excludeGlobs = source["excludeGlobs"];
	        this.bigFilesMinBytes = source["bigFilesMinBytes"];
	    }
	}
	export class BigFilesScanRequest {
	    roots: string[];
	    minSizeBytes: number;
	    includeBigFiles: boolean;
	    includeArchives: boolean;
	
	    static createFrom(source: any = {}) {
	        return new BigFilesScanRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.roots = source["roots"];
	        this.minSizeBytes = source["minSizeBytes"];
	        this.includeBigFiles = source["includeBigFiles"];
	        this.includeArchives = source["includeArchives"];
	    }
	}
	export class CategorySummary {
	    id: string;
	    label: string;
	    risk: string;
	    itemCount: number;
	    sizeBytes: number;
	
	    static createFrom(source: any = {}) {
	        return new CategorySummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.label = source["label"];
	        this.risk = source["risk"];
	        this.itemCount = source["itemCount"];
	        this.sizeBytes = source["sizeBytes"];
	    }
	}
	export class ScanItem {
	    id: string;
	    path: string;
	    category: string;
	    categoryLabel: string;
	    sizeBytes: number;
	    risk: string;
	    description: string;
	    selected: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ScanItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.path = source["path"];
	        this.category = source["category"];
	        this.categoryLabel = source["categoryLabel"];
	        this.sizeBytes = source["sizeBytes"];
	        this.risk = source["risk"];
	        this.description = source["description"];
	        this.selected = source["selected"];
	    }
	}
	export class CleanupReport {
	    dryRun: boolean;
	    items: ScanItem[];
	    categories: CategorySummary[];
	    totalBytes: number;
	    deleted: number;
	    failed: number;
	    failedPaths?: string[];
	
	    static createFrom(source: any = {}) {
	        return new CleanupReport(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.dryRun = source["dryRun"];
	        this.items = this.convertValues(source["items"], ScanItem);
	        this.categories = this.convertValues(source["categories"], CategorySummary);
	        this.totalBytes = source["totalBytes"];
	        this.deleted = source["deleted"];
	        this.failed = source["failed"];
	        this.failedPaths = source["failedPaths"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class DeleteResult {
	    path: string;
	    success: boolean;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new DeleteResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.success = source["success"];
	        this.error = source["error"];
	    }
	}
	export class DirNode {
	    name: string;
	    path: string;
	    sizeBytes: number;
	    isDir: boolean;
	    children?: DirNode[];
	
	    static createFrom(source: any = {}) {
	        return new DirNode(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.sizeBytes = source["sizeBytes"];
	        this.isDir = source["isDir"];
	        this.children = this.convertValues(source["children"], DirNode);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class DiskSummary {
	    totalBytes: number;
	    usedBytes: number;
	    freeBytes: number;
	    volumeName: string;
	    mountPoint: string;
	
	    static createFrom(source: any = {}) {
	        return new DiskSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.totalBytes = source["totalBytes"];
	        this.usedBytes = source["usedBytes"];
	        this.freeBytes = source["freeBytes"];
	        this.volumeName = source["volumeName"];
	        this.mountPoint = source["mountPoint"];
	    }
	}
	export class DuplicateGroup {
	    hash: string;
	    sizeBytes: number;
	    paths: string[];
	    keeper: string;
	
	    static createFrom(source: any = {}) {
	        return new DuplicateGroup(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hash = source["hash"];
	        this.sizeBytes = source["sizeBytes"];
	        this.paths = source["paths"];
	        this.keeper = source["keeper"];
	    }
	}
	export class DuplicateDeleteRequest {
	    groups: DuplicateGroup[];
	
	    static createFrom(source: any = {}) {
	        return new DuplicateDeleteRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.groups = this.convertValues(source["groups"], DuplicateGroup);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class InstalledApp {
	    name: string;
	    bundleId: string;
	    path: string;
	    version: string;
	    sizeBytes: number;
	    systemApp: boolean;
	
	    static createFrom(source: any = {}) {
	        return new InstalledApp(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.bundleId = source["bundleId"];
	        this.path = source["path"];
	        this.version = source["version"];
	        this.sizeBytes = source["sizeBytes"];
	        this.systemApp = source["systemApp"];
	    }
	}
	export class LeftoverFile {
	    path: string;
	    sizeBytes: number;
	    kind: string;
	
	    static createFrom(source: any = {}) {
	        return new LeftoverFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.sizeBytes = source["sizeBytes"];
	        this.kind = source["kind"];
	    }
	}
	export class LeftoverGroup {
	    app: InstalledApp;
	    files: LeftoverFile[];
	
	    static createFrom(source: any = {}) {
	        return new LeftoverGroup(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.app = this.convertValues(source["app"], InstalledApp);
	        this.files = this.convertValues(source["files"], LeftoverFile);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PermissionStatus {
	    fullDiskAccess: string;
	    homeDir: string;
	
	    static createFrom(source: any = {}) {
	        return new PermissionStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.fullDiskAccess = source["fullDiskAccess"];
	        this.homeDir = source["homeDir"];
	    }
	}
	
	export class UninstallSelection {
	    appPath: string;
	    leftoverPaths: string[];
	
	    static createFrom(source: any = {}) {
	        return new UninstallSelection(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.appPath = source["appPath"];
	        this.leftoverPaths = source["leftoverPaths"];
	    }
	}

}

