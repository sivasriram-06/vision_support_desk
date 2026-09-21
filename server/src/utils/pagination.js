const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * Normalizes page/limit query params into a safe offset + limit pair, per
 * the project's API standard (default 50, max 100).
 */
const parsePagination = (query = {}) => {
    let limit = Number.parseInt(query.limit, 10);
    if (!Number.isFinite(limit) || limit <= 0) {
        limit = DEFAULT_LIMIT;
    }
    limit = Math.min(limit, MAX_LIMIT);

    let page = Number.parseInt(query.page, 10);
    if (!Number.isFinite(page) || page <= 0) {
        page = 1;
    }

    const offset = (page - 1) * limit;
    return { page, limit, offset };
};

/**
 * Builds the {limit,nextCursor,hasMore} paging block from a page/limit
 * request and the total row count.
 */
const buildPaging = ({ page, limit }, total) => {
    const hasMore = page * limit < total;
    return {
        limit,
        page,
        total,
        hasMore,
        nextCursor: hasMore ? String(page + 1) : null
    };
};

module.exports = {
    DEFAULT_LIMIT,
    MAX_LIMIT,
    parsePagination,
    buildPaging
};
