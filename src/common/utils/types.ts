export interface Paginated<T> {
    items: T[];
    meta: {
        total: number;
        page: number;
        limit: number;
        pageCount: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
}