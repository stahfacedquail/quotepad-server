const getTags = (req, res) => {
    new db.Tags()
    .orderBy("value", "ASC")
    .fetch()
    .then(tags => res.send(tags.toJSON()))
    .catch(error => res.send(error));
};

const createTag = (tag, trx) => {
    return new db.Tag().save({ value: tag.value }, { transacting: trx });
};

const cleanUpZombieTags = (quoteId, trx) => {
    return trx.raw( "SELECT tag_id from quote_tags " +
            "WHERE tag_id IN (" +
                "SELECT quote_tags.tag_id " +
                "FROM tags LEFT JOIN quote_tags " +
                "ON tags.id = quote_tags.tag_id " +
                "GROUP BY quote_tags.tag_id " +
                "HAVING COUNT(quote_tags.tag_id) = 0" +
            ") AND quote_id = ?;", [ quoteId ]
    ).then(quotelessTags => {
        quotelessTags = quotelessTags.rows;
        console.log("Delete these quoteless tags", quotelessTags)

        if(quotelessTags.length == 0)
            return Promise.resolve(null);

        quotelessTags = quotelessTags.map(tag =>
            new db.Tag()
            .where({ id: tag.tag_id })
            .destroy({ transacting: trx })
        );

        return Promise.all(quotelessTags);
    });
};

module.exports = {
    getTags,
    createTag,
    cleanUpZombieTags
};