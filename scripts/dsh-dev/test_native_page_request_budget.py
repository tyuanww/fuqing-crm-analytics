from test_native_page_composition import FILTERS, composition as composition, editable_draft, value


def test_seven_source_page_edit_fits_identity_budget(composition):
    rpc, state, _ = composition
    state(use_rate_limits=True)
    assert value(rpc('login'))['connected']
    refs = [value(rpc('query', filters={**FILTERS, 'end_date': f'2026-01-{day:02d}'}))['source_ref']
            for day in range(2, 9)]
    body = editable_draft(refs[0])
    body['binding_manifest']['result_refs'] = refs
    opened = value(rpc('storeOpen', draft=body))
    assert opened['current']['version'] == 1, opened
    for _ in range(2):
        for ref in refs:
            rendered = value(rpc('frame', payload={'result_ref': ref, 'mode': 'summary'}))
            assert rendered.get('event') == 'data.chunk', rendered
    before = state()['identity_checks']
    edited = value(rpc('storeText', node='title', text='已复核文案', key='seven-source-edit'))
    observed = state()
    assert edited['current']['version'] == 2, (edited.get('error'), edited.get('confirmationUncertain'), observed)
    reopened = value(rpc('storeReopen'))
    assert reopened['presentation_overlay'] == {'title': {'text': '已复核文案'}}
    checks = state()['identity_checks']
    print(f'IDENTITY_REQUESTS total={checks} edit={checks - before}')
    assert checks <= 600
