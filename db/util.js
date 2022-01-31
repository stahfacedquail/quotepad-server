const deleteMultiple = (filteredCollexn, ModelClass, trx) => {
    return filteredCollexn
    .fetch({ transacting: trx, require: false })
    .then(items => {
        return Promise.all(
            items.toJSON().map(item => new ModelClass()
                .where(item)
                .destroy({ transacting: trx })
            ) 
        );
    });
}

module.exports = {
    deleteMultiple
};