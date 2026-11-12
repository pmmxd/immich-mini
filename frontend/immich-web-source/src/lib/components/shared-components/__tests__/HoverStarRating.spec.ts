import { fireEvent, render } from '@testing-library/svelte';
import HoverStarRating from '$lib/components/shared-components/HoverStarRating.svelte';

describe('HoverStarRating', () => {
  it('sets a rating from the clicked star', async () => {
    const onRate = vi.fn();
    const component = render(HoverStarRating, { rating: 2, onRate });
    const stars = component.getAllByRole('button');

    expect(stars).toHaveLength(5);
    await fireEvent.click(stars[4]!);
    expect(onRate).toHaveBeenCalledWith(5);
  });
});
